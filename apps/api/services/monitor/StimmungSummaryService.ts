import { generateObject } from 'ai';
import { z } from 'zod';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';
import { getModel, isProviderConfigured } from '../ai/providers.js';

import { EMOTION_NAMES, TOPIC_NAMES } from './types.js';

import type { StimmungResult } from './MonitorService.js';
import type { MonitorLocale } from './types.js';

const log = createLogger('StimmungSummary');
const db = getPostgresInstance;

const PROVIDER = isProviderConfigured('litellm') ? 'litellm' : 'mistral';
const CACHE_TTL = 7200;

const emotionKeys = Object.keys(EMOTION_NAMES) as [string, ...string[]];

const StimmungSummarySchema = z.object({
  moodSummary: z
    .string()
    .describe(
      '2-3 Sätze: Was prägt die Stimmung heute? Nenne konkrete Themen, Quellen und Zusammenhänge.'
    ),
  dominantEmotion: z.enum(emotionKeys),
  dominantReason: z.string().describe('Hauptgrund in max 10 Wörtern'),
});

export type StimmungSummary = z.infer<typeof StimmungSummarySchema>;

interface EmotionArticle {
  title: string;
  excerpt: string;
  source: string;
  primary_topic: string | null;
  emotion_score: number;
}

function findDominantEmotion(overall: Record<string, number>): string {
  let max = 0;
  let dominant = 'angst';
  for (const [key, val] of Object.entries(overall)) {
    if (val > max) {
      max = val;
      dominant = key;
    }
  }
  return dominant;
}

function truncateExcerpt(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text;
  const cut = text.lastIndexOf(' ', maxLen);
  return text.slice(0, cut > 0 ? cut : maxLen) + '...';
}

function formatTopicEmotions(byTopic: StimmungResult['byTopic']): string {
  return byTopic
    .slice(0, 5)
    .map((t) => {
      const topicName = TOPIC_NAMES[t.topic] || t.topic;
      const emotions = Object.entries(t.emotions)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([k, v]) => `${EMOTION_NAMES[k] || k} ${Math.round(v)}`)
        .join(', ');
      return `- ${topicName}: ${emotions} (${t.articleCount} Artikel)`;
    })
    .join('\n');
}

export async function getStimmungSummary(
  locale?: MonitorLocale,
  stimmungData?: StimmungResult
): Promise<StimmungSummary | null> {
  const cacheKey = `monitor:stimmung-summary:${locale || 'all'}`;

  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached) as StimmungSummary;
  } catch {
    // Fall through
  }

  if (!stimmungData || Object.keys(stimmungData.overall).length === 0) {
    return null;
  }

  try {
    const timeCondition =
      "(published_at > now() - interval '25 hours' OR (published_at IS NULL AND last_seen_at > now() - interval '25 hours'))";

    const dominant = findDominantEmotion(stimmungData.overall);
    if (!(dominant in EMOTION_NAMES)) return null;

    const dominantName = EMOTION_NAMES[dominant] || dominant;
    const dominantScore = Math.round(stimmungData.overall[dominant] ?? 0);

    const params: unknown[] = [];
    let localeCondition = '';
    if (locale) {
      params.push(locale);
      localeCondition = `AND locale = $${params.length}`;
    }

    const [emotionRows, headlineRows] = await Promise.all([
      db().query(
        `SELECT title, excerpt, source, primary_topic,
                (emotion_scores->>'${dominant}')::float as emotion_score
         FROM monitor_articles
         WHERE ${timeCondition} ${localeCondition}
           AND emotion_scores IS NOT NULL
           AND emotion_scores != '{}'::jsonb
           AND (emotion_scores->>'${dominant}')::float > 0
         ORDER BY (emotion_scores->>'${dominant}')::float DESC NULLS LAST
         LIMIT 5`,
        params
      ),
      db().query(
        `SELECT title, source FROM monitor_articles
         WHERE ${timeCondition} ${localeCondition}
         ORDER BY last_seen_at DESC
         LIMIT 10`,
        params
      ),
    ]);

    const topEmotionArticles = emotionRows.map((r) => ({
      title: String(r.title ?? ''),
      excerpt: String(r.excerpt ?? ''),
      source: String(r.source ?? ''),
      primary_topic: r.primary_topic as string | null,
      emotion_score: Number(r.emotion_score) || 0,
    }));
    const recentHeadlines = headlineRows.map((r) => ({
      title: String(r.title ?? ''),
      source: String(r.source ?? ''),
    }));

    if (topEmotionArticles.length === 0 && recentHeadlines.length < 3) {
      log.info('Not enough articles for mood summary');
      return null;
    }

    const drivingArticles = topEmotionArticles
      .map((a, i) => `${i + 1}. [${a.source}] "${a.title}" — ${truncateExcerpt(a.excerpt)}`)
      .join('\n');

    const headlines = recentHeadlines
      .map((r, i) => `${i + 1}. [${r.source}] ${r.title}`)
      .join('\n');

    const topicBreakdown = formatTopicEmotions(stimmungData.byTopic);

    const overallScores = Object.entries(stimmungData.overall)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${EMOTION_NAMES[k] || k}: ${Math.round(v)}`)
      .join(', ');

    const country = locale === 'at' ? 'österreichischen' : 'deutschen';

    const model = getModel(PROVIDER);
    const result = await generateObject({
      model,
      schema: StimmungSummarySchema,
      system: `Du analysierst die emotionale Stimmung in ${country} Nachrichtenmedien.
Du erhältst Stimmungsdaten, die stärksten Artikel und Themen-Aufschlüsselungen.
Deine Aufgabe: Erkläre in 2-3 Sätzen, WARUM die Stimmung so ist wie sie ist.

REGELN:
- Nenne konkrete Themen und Quellen aus den Artikeln
- Verwende Formulierungen wie "laut Tagesschau", "wie der Spiegel berichtet"
- Erkläre den Zusammenhang zwischen Themen und Emotionen
- Verwende geschlechtergerechte Sprache mit Genderstern (*)
- Sei sachlich und prägnant`,
      prompt: `STIMMUNGSDATEN:
Dominante Emotion: ${dominantName} (Score: ${dominantScore})
Gesamtbild: ${overallScores}

TOP-ARTIKEL MIT STÄRKSTER ${dominantName.toUpperCase()}-AUSPRÄGUNG:
${drivingArticles || 'Keine Artikel mit starker Emotionsausprägung gefunden.'}

THEMEN-STIMMUNG:
${topicBreakdown || 'Keine Themen-Aufschlüsselung verfügbar.'}

AKTUELLE SCHLAGZEILEN:
${headlines}

Analysiere die Gesamtstimmung und erkläre, woher sie kommt.`,
      temperature: 0.3,
      maxOutputTokens: 300,
    });

    const summary = result.object;

    try {
      await redisClient.set(cacheKey, JSON.stringify(summary), { EX: CACHE_TTL });
    } catch {
      // Non-critical
    }

    return summary;
  } catch (error) {
    log.error(`Failed to generate stimmung summary: ${error}`);
    return null;
  }
}

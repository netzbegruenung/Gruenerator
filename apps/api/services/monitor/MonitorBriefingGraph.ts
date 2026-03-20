/**
 * Monitor Briefing LangGraph Pipeline
 *
 * 3-node graph: researchPositions → composeBriefing → generateTweets → END
 * Searches Grüne party positions on hot topics, then generates a daily
 * AI briefing and 3 tweet suggestions from monitor data + party positions.
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { generateText } from 'ai';
import { z } from 'zod';

import { executeResearch } from '../../routes/chat/agents/directSearch.js';
import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';
import { getModel, isProviderConfigured } from '../ai/providers.js';

import { EMOTION_NAMES, TOPIC_NAMES } from './types.js';

import type { StimmungResult } from './MonitorService.js';
import type { MonitorSnapshot } from './types.js';

const log = createLogger('MonitorBriefing');

const PROVIDER = isProviderConfigured('litellm') ? 'litellm' : 'mistral';
const PROVIDER_LABEL = PROVIDER === 'litellm' ? 'gpt-oss (litellm)' : 'mistral';
const CACHE_TTL_SECONDS = 7200;

// ─── State ───────────────────────────────────────────────────────────

const BriefingStateAnnotation = Annotation.Root({
  topicsText: Annotation<string>({ reducer: (x, y) => y ?? x }),
  keywordsText: Annotation<string>({ reducer: (x, y) => y ?? x }),
  stimmungText: Annotation<string>({ reducer: (x, y) => y ?? x }),
  pollsText: Annotation<string>({ reducer: (x, y) => y ?? x }),
  meta: Annotation<string>({ reducer: (x, y) => y ?? x }),
  dominantTopicName: Annotation<string>({ reducer: (x, y) => y ?? x }),
  positionsText: Annotation<string>({ reducer: (_, y) => y ?? '' }),
  briefingText: Annotation<string>({ reducer: (_, y) => y ?? '' }),
  tweets: Annotation<Array<{ text: string; topic: string; hashtags: string[] }>>({
    reducer: (_, y) => y ?? [],
  }),
});

type BriefingState = typeof BriefingStateAnnotation.State;

// ─── Node 1: Research Grüne positions on hot topic ───────────────────

async function researchPositionsNode(state: BriefingState): Promise<Partial<BriefingState>> {
  if (!state.dominantTopicName) {
    log.warn('researchPositions: no dominantTopicName, skipping');
    return { positionsText: '' };
  }

  log.info(
    `researchPositions: searching for Grüne positions on "${state.dominantTopicName}" via ${PROVIDER_LABEL}`
  );
  try {
    const result = await executeResearch({
      question: `Was haben Bündnis 90/Die Grünen in ihren Programmen, Beschlüssen und parlamentarischen Initiativen zum Thema "${state.dominantTopicName}" festgelegt? Berücksichtige Grundsatzprogramm, Wahlprogramm, Bundestagsanträge und aktuelle Positionspapiere. Fasse die bestehenden Positionen detailliert zusammen.`,
      depth: 'thorough',
      maxSources: 12,
      useLLMSynthesis: true,
    });

    log.info(
      `researchPositions: ${result.citations.length} citations, confidence: ${result.confidence}, answer: ${result.answer.length} chars`
    );
    return { positionsText: result.answer || '' };
  } catch (error) {
    log.error(`researchPositions failed: ${error instanceof Error ? error.message : error}`);
    return { positionsText: '' };
  }
}

// ─── Node 2: Generate briefing prose ─────────────────────────────────

async function composeBriefingNode(state: BriefingState): Promise<Partial<BriefingState>> {
  log.info(
    `composeBriefing: generating via ${PROVIDER_LABEL}, positions: ${state.positionsText.length} chars`
  );
  try {
    const model = getModel(PROVIDER);
    const result = await generateText({
      model,
      system: `Du bist ein*e erfahrene*r Medienanalyst*in und schreibst eine kurze KI-Einordnung zum dominierenden Thema des Tages für das Kommunikationsteam von Bündnis 90/Die Grünen.

Schreibe 2-3 kurze Absätze (jeweils 2-3 Sätze) über das Hot Topic. Der Ton ist professionell, analytisch und zugänglich.

REGELN:
- Schreibe AUSSCHLIESSLICH über das Hot Topic "${state.dominantTopicName}"
- Beziehe dich auf die konkreten Schlagzeilen — nenne Quellen und Akteur*innen
- Wenn Grüne-Positionen vorhanden sind: Stelle den Bezug zum aktuellen Thema her
- Erwähne die emotionale Stimmung nur kurz, wenn auffällig
- Nenne KEINE anderen Themen, Umfragewerte oder Statistiken
- Setze **wichtige Begriffe** und **Akteur*innen** fett
- Verwende Genderstern (*) bei Personenbezeichnungen
- Max 200 Wörter
- Keine Aufzählungen, keine Überschriften — reiner Fließtext
- Schreibe auf Deutsch
- Erwähne NUR Medien, Parteien und Akteur*innen aus dem Fokusland`,
      prompt: `${state.meta}

HOT TOPIC:
${state.topicsText}

Weitere Themen: ${state.keywordsText}

STIMMUNGSLAGE:
${state.stimmungText}
${state.positionsText ? `\nGRÜNE POSITIONEN ZU "${state.dominantTopicName}":\n${state.positionsText}` : ''}

Schreibe die KI-Einordnung zum Hot Topic "${state.dominantTopicName}".`,
      temperature: 0.4,
      maxOutputTokens: 1500,
    });

    log.info(`Briefing generated: ${result.text.split(/\s+/).length} words`);
    return { briefingText: result.text };
  } catch (error) {
    log.error(`composeBriefing failed: ${error}`);
    return { briefingText: `Die wichtigsten Themen heute: ${state.topicsText}` };
  }
}

// ─── Node 3: Generate tweet suggestions ──────────────────────────────

const TweetSchema = z.object({
  text: z.string(),
  topic: z.string(),
  hashtags: z.array(z.string()),
});

async function generateTweetsNode(state: BriefingState): Promise<Partial<BriefingState>> {
  log.info(`generateTweets: generating 3 tweets via ${PROVIDER_LABEL}`);
  try {
    const model = getModel(PROVIDER);
    const result = await generateText({
      model,
      system: `Du schreibst Tweet-Vorschläge für den offiziellen Twitter/X-Account von Bündnis 90/Die Grünen.

REGELN:
- Exakt 3 Tweets, jeder maximal 280 Zeichen
- Ton: klar, pointiert, meinungsstark aber sachlich
- Grüne Perspektive: konstruktiv, lösungsorientiert — beziehe dich auf konkrete Grüne Positionen wenn vorhanden
- Verwende Genderstern (*) bei Personenbezeichnungen
- Hashtags: maximal 2 pro Tweet, nur wenn sie wirklich passen
- Jeder Tweet behandelt einen anderen Aspekt oder ein anderes Thema
- Mindestens 1 Tweet soll sich auf eine konkrete Grüne Position beziehen (wenn Positionen vorhanden)
- Keine Emojis
- Schreibe auf Deutsch

Antworte NUR mit einem JSON-Array. Kein anderer Text. Format:
[{"text": "Tweet-Text hier", "topic": "thema-id", "hashtags": ["Tag1"]}, ...]`,
      prompt: `Basierend auf diesem Tages-Briefing, erstelle 3 Tweet-Vorschläge als JSON-Array:

${state.briefingText}

KONTEXT — Top-Themen und Keywords:
${state.topicsText}
${state.keywordsText}
${state.positionsText ? `\nGRÜNE POSITIONEN (nutze diese für fundierte Tweets):\n${state.positionsText}` : ''}`,
      temperature: 0.6,
      maxOutputTokens: 2000,
    });

    const rawText = result.text.trim();
    log.debug(
      `generateTweets: raw response (${rawText.length} chars): ${rawText.slice(0, 300)}...`
    );

    // Extract JSON array from response (may have markdown fences or surrounding text)
    let jsonStr = rawText;
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    if (!jsonStr.startsWith('[')) {
      const arrayMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (arrayMatch) jsonStr = arrayMatch[0];
    }

    // Attempt parse, with repair for truncated JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      log.warn(
        `generateTweets: JSON parse failed, attempting repair: ${(parseErr as Error).message}`
      );
      // Try closing any open strings/objects/arrays
      const repaired = jsonStr.replace(/,\s*$/, '') + ']}]';
      try {
        parsed = JSON.parse(repaired);
      } catch {
        log.error(`generateTweets: JSON repair also failed, raw: ${jsonStr.slice(-100)}`);
        return { tweets: [] };
      }
    }

    const tweets = z.array(TweetSchema).parse(parsed).slice(0, 3);

    log.info(
      `generateTweets: ${tweets.length} tweets parsed, chars: ${tweets.map((t) => t.text.length).join('/')}`
    );
    return { tweets };
  } catch (error) {
    log.error(`generateTweets failed: ${error instanceof Error ? error.message : error}`);
    return { tweets: [] };
  }
}

// ─── Graph ───────────────────────────────────────────────────────────

const graph = new StateGraph(BriefingStateAnnotation)
  .addNode('researchPositions', researchPositionsNode)
  .addNode('composeBriefing', composeBriefingNode)
  .addNode('generateTweets', generateTweetsNode)
  .addEdge('__start__', 'researchPositions')
  .addEdge('researchPositions', 'composeBriefing')
  .addEdge('composeBriefing', 'generateTweets')
  .addEdge('generateTweets', END)
  .compile();

// ─── Data Formatting Helpers ─────────────────────────────────────────

function formatHotTopic(snapshot: MonitorSnapshot): string {
  const top = snapshot.topics.find((t) => t.articleCount > 0);
  if (!top) return '';
  const name = TOPIC_NAMES[top.topic] || top.topic;
  const headlines = top.topArticles
    .slice(0, 5)
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}`)
    .join('\n');
  return `${name} (${top.articleCount} Artikel)\nTop-Schlagzeilen:\n${headlines}`;
}

function formatOtherTopics(snapshot: MonitorSnapshot): string {
  return snapshot.topics
    .filter((t) => t.articleCount > 0)
    .slice(1, 4)
    .map((t) => `${TOPIC_NAMES[t.topic] || t.topic} (${t.articleCount} Artikel)`)
    .join(', ');
}

function formatKeywords(snapshot: MonitorSnapshot): string {
  return (snapshot.keywords || [])
    .slice(0, 8)
    .map((k) => `${k.keyword} (${k.count}x)`)
    .join(', ');
}

function formatStimmung(stimmung: StimmungResult): string {
  if (!stimmung || Object.keys(stimmung.overall).length === 0)
    return 'Keine Stimmungsdaten verfügbar.';

  const emotions = Object.entries(stimmung.overall)
    .sort(([, a], [, b]) => b - a)
    .map(([k, v]) => `${EMOTION_NAMES[k] || k}: ${v.toFixed(1)}`)
    .join(', ');

  const dominant = stimmung.dominantEmotion
    ? `Dominante Stimmung: ${EMOTION_NAMES[stimmung.dominantEmotion] || stimmung.dominantEmotion}`
    : '';

  return `${dominant}\nEmotionswerte: ${emotions}`;
}

function formatPolls(pollAverages: Record<string, number>): string {
  if (!pollAverages || Object.keys(pollAverages).length === 0)
    return 'Keine Umfragedaten verfügbar.';

  return Object.entries(pollAverages)
    .sort(([, a], [, b]) => b - a)
    .map(([party, avg]) => `${party}: ${avg}%`)
    .join(', ');
}

// ─── Public API ──────────────────────────────────────────────────────

export interface MonitorBriefingResult {
  briefing: string;
  tweets: Array<{ text: string; topic: string; hashtags: string[] }>;
  generatedAt: string;
}

export async function generateMonitorBriefing(
  locale: string,
  snapshot: MonitorSnapshot,
  stimmung: StimmungResult,
  pollAverages: Record<string, number>
): Promise<MonitorBriefingResult> {
  const cacheKey = `monitor:briefing:${locale}`;

  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      log.info(`generateMonitorBriefing: cache HIT for ${locale}`);
      return JSON.parse(cached);
    }
  } catch {
    // Fall through
  }

  log.info(
    `generateMonitorBriefing: cache MISS for ${locale}, generating via ${PROVIDER_LABEL}...`
  );

  const hotTopicText = formatHotTopic(snapshot);
  if (!hotTopicText) {
    log.warn('generateMonitorBriefing: no topics with articles, aborting');
    return {
      briefing: 'Keine Daten für das Briefing verfügbar.',
      tweets: [],
      generatedAt: new Date().toISOString(),
    };
  }

  try {
    const topTopic = snapshot.topics.find((t) => t.articleCount > 0);
    const dominantTopicName = topTopic ? TOPIC_NAMES[topTopic.topic] || topTopic.topic : '';
    const country = locale === 'at' ? 'Österreich' : 'Deutschland';
    log.info(
      `generateMonitorBriefing: hot topic: "${dominantTopicName}", ${snapshot.totalArticles} articles, locale: ${country}`
    );

    const result = await graph.invoke({
      topicsText: hotTopicText,
      keywordsText: formatOtherTopics(snapshot),
      stimmungText: formatStimmung(stimmung),
      pollsText: formatPolls(pollAverages),
      meta: `Fokus: ${country} · ${snapshot.totalArticles} Artikel aus ${snapshot.sources.length} Quellen`,
      dominantTopicName,
      positionsText: '',
      briefingText: '',
      tweets: [],
    });

    const tweets = (result.tweets || []).slice(0, 3);
    const briefingResult: MonitorBriefingResult = {
      briefing: result.briefingText || 'Briefing konnte nicht generiert werden.',
      tweets,
      generatedAt: new Date().toISOString(),
    };

    log.info(
      `generateMonitorBriefing: done — briefing ${briefingResult.briefing.length} chars, ${tweets.length} tweets`
    );

    // Only cache if we have both briefing and tweets (partial results = retry next time)
    if (briefingResult.briefing && tweets.length > 0) {
      log.info(`generateMonitorBriefing: caching result for ${locale} (${CACHE_TTL_SECONDS}s)`);
      try {
        await redisClient.set(cacheKey, JSON.stringify(briefingResult), { EX: CACHE_TTL_SECONDS });
      } catch {
        // Non-critical
      }
    }

    return briefingResult;
  } catch (error) {
    log.error(`MonitorBriefing graph failed: ${error}`);
    return {
      briefing: 'Briefing konnte nicht generiert werden.',
      tweets: [],
      generatedAt: new Date().toISOString(),
    };
  }
}

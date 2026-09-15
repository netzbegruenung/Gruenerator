/**
 * Hot-topic analysis pipeline (replaces MonitorBriefingGraph + KeywordInsightsGraph).
 *
 * One research run over the snapshot's hot topic feeds three surfaces: the
 * "KI-Einordnung" briefing, the tweet suggestions and the positions card
 * ("Das haben wir in der Vergangenheit dazu gesagt"). Anchoring everything on
 * the same hot topic + headlines guarantees the Überblick hero and the
 * positions card never diverge thematically.
 *
 * Plain async functions, deliberately no LangGraph: the flow is linear with a
 * single parallel fan-out, and none of LangGraph's features (checkpoints,
 * streaming, interrupts) were used.
 */
import {
  monitorHotTopicAnalysisSchema,
  monitorTweetSchema,
  type MonitorCitation,
  type MonitorHotTopicAnalysis,
} from '@gruenerator/contracts';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';

import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';
import { getMonitorModel } from '../ai/providers.js';

import { executeResearch } from './research/researchOrchestrator.js';
import { TOPIC_NAMES } from './types.js';

import type { ResearchCitation, ResearchResult } from './research/researchOrchestrator.js';
import type { KeywordEntry, MonitorLocale, MonitorSnapshot, TopicScore } from './types.js';

const log = createLogger('HotTopic');

const CACHE_TTL_SECONDS = 7200;

const cacheKey = (locale: MonitorLocale) => `monitor:hot-topic:${locale}`;

// ─── Snapshot anchoring ──────────────────────────────────────────────

interface HotTopicAnchor {
  topic: TopicScore;
  name: string;
  /** "1. [source] title" lines for the top 5 articles. */
  headlinesText: string;
  fingerprint: string;
}

// Newline-separated "topic\nurl1\nurl2\nurl3" — URLs never contain newlines.
function buildFingerprint(topic: string, urls: string[]): string {
  return [topic, ...urls].join('\n');
}

/**
 * A cached analysis is still about the same story when the topic bucket is
 * unchanged and at least one of the top-3 article URLs overlaps. Exact
 * equality would churn on every score reorder or single new article and
 * regenerate the expensive research pipeline near-hourly.
 */
function isSameStory(cachedFingerprint: string, anchorFingerprint: string): boolean {
  const [cachedTopic, ...cachedUrls] = cachedFingerprint.split('\n');
  const [anchorTopic, ...anchorUrls] = anchorFingerprint.split('\n');
  if (cachedTopic !== anchorTopic) return false;
  return cachedUrls.some((url) => anchorUrls.includes(url));
}

function getHotTopicAnchor(snapshot: MonitorSnapshot): HotTopicAnchor | null {
  const top = snapshot.topics.find((t) => t.articleCount > 0);
  if (!top) return null;
  const headlinesText = top.topArticles
    .slice(0, 5)
    .map((a, i) => `${i + 1}. [${a.source}] ${a.title}`)
    .join('\n');
  const fingerprint = buildFingerprint(
    top.topic,
    top.topArticles.slice(0, 3).map((a) => a.url)
  );
  return { topic: top, name: TOPIC_NAMES[top.topic] || top.topic, headlinesText, fingerprint };
}

function formatOtherTopics(snapshot: MonitorSnapshot): string {
  return snapshot.topics
    .filter((t) => t.articleCount > 0)
    .slice(1, 4)
    .map((t) => `${TOPIC_NAMES[t.topic] || t.topic} (${t.articleCount} Artikel)`)
    .join(', ');
}

// ─── Step 1: name the concrete theme of the hot topic ────────────────

const ThemeSchema = z.object({
  dominantTopic: z
    .string()
    .describe('Konkretes Thema der Top-Schlagzeilen, z.B. "Iran-Konflikt und Sicherheitspolitik"'),
  researchQuery: z
    .string()
    .describe(
      'Suchquery für Grüne-Positionen zu diesem Thema, z.B. "Grüne Position Iran Krieg Sicherheitspolitik NATO"'
    ),
  secondaryTopics: z
    .array(z.string())
    .describe('Weitere aktuelle Themen, die nicht zum Hauptthema gehören'),
});

type Theme = z.infer<typeof ThemeSchema>;

async function deriveTheme(anchor: HotTopicAnchor, keywords: KeywordEntry[]): Promise<Theme> {
  const keywordList = keywords
    .slice(0, 10)
    .map((k) => `${k.keyword} (${k.count}x)`)
    .join(', ');

  try {
    const result = await generateObject({
      model: getMonitorModel(),
      schema: ThemeSchema,
      system: `Du analysierst das dominierende Nachrichtenthema des Tages für das Kommunikationsteam von Bündnis 90/Die Grünen.

REGELN:
- Benenne das KONKRETE Thema der Top-Schlagzeilen (nicht die grobe Kategorie)
- Erstelle eine Suchquery für Grüne-Parteipositionen zu genau diesem Thema
- Keywords, die nichts mit dem Hauptthema zu tun haben → secondaryTopics`,
      prompt: `Hot-Topic-Kategorie: ${anchor.name}

Top-Schlagzeilen:
${anchor.headlinesText}

Weitere aktuelle Keywords: ${keywordList}

Benenne das dominierende Thema dieser Schlagzeilen und erstelle eine Suchquery.`,
      temperature: 0.2,
    });

    log.info(
      `deriveTheme: "${result.object.dominantTopic}" (query: "${result.object.researchQuery}")`
    );
    return result.object;
  } catch (error) {
    const topKeywords = keywords
      .slice(0, 3)
      .map((k) => k.keyword)
      .join(' ');
    log.warn(`deriveTheme failed, falling back to topic name: ${error}`);
    return {
      dominantTopic: anchor.name,
      researchQuery: `Grüne Position ${anchor.name} ${topKeywords}`,
      secondaryTopics: keywords.slice(3, 6).map((k) => k.keyword),
    };
  }
}

// ─── Step 2: one research run over Grüne positions ───────────────────

async function researchPositions(theme: Theme, anchor: HotTopicAnchor): Promise<ResearchResult> {
  const question = `Was haben Bündnis 90/Die Grünen in ihren Programmen, Beschlüssen und parlamentarischen Initiativen zum Thema "${theme.dominantTopic}" festgelegt? Berücksichtige Grundsatzprogramm, Wahlprogramm, Bundestagsanträge und aktuelle Positionspapiere.

Hintergrund — die aktuellen Top-Schlagzeilen:
${anchor.headlinesText}
Weitere Themen: ${theme.secondaryTopics.join(', ')}

Jede Quelle muss eine Aussage zu "${theme.dominantTopic}" enthalten. Allgemeine Partei- oder Programmübersichten ohne Bezug zu diesem Thema sind unbrauchbar — Lexikonartikel über die Partei, Parteiportraits und Übersichtsseiten von Programmen zählen nicht als Beleg.

Fasse die bestehenden Grünen-Positionen detailliert zusammen. Verwende Vergangenheitsform ("Die Grünen haben gefordert...", "Im Programm hieß es..."). Erwähne auch kurz die Nebenthemen, falls relevante Positionen vorhanden sind.`;

  // This used to route straight into Linkup's own `deep` dossier — the most
  // expensive call in the product, once per hot topic per day — because
  // `executeResearch` short-circuited there whenever LINKUP_API_KEY was set.
  // It now runs our own pipeline: `gruendlich` sub-searches (the same engine
  // depth as an ordinary web search, one paid call each) plus the page reader,
  // which is what makes the positions summary specific rather than generic.
  return executeResearch({
    question,
    maxSources: 20,
  });
}

// ─── Step 3a: briefing prose ─────────────────────────────────────────

async function composeBriefing(
  theme: Theme,
  anchor: HotTopicAnchor,
  snapshot: MonitorSnapshot,
  locale: MonitorLocale,
  positionsText: string
): Promise<string> {
  const country = locale === 'at' ? 'Österreich' : 'Deutschland';
  try {
    const result = await generateText({
      model: getMonitorModel(),
      system: `Du bist ein*e erfahrene*r Medienanalyst*in und schreibst eine kurze KI-Einordnung zum dominierenden Thema des Tages für das Kommunikationsteam von Bündnis 90/Die Grünen.

Schreibe 2-3 kurze Absätze (jeweils 2-3 Sätze) über das Hot Topic. Der Ton ist professionell, analytisch und zugänglich.

REGELN:
- Schreibe AUSSCHLIESSLICH über das Hot Topic "${theme.dominantTopic}"
- Beziehe dich auf die konkreten Schlagzeilen — nenne Quellen und Akteur*innen
- Wenn Grüne-Positionen vorhanden sind: Stelle den Bezug zum aktuellen Thema her und markiere die Quelle mit ihrer Nummer in eckigen Klammern, z.B. [1]
- Nenne KEINE anderen Themen, Umfragewerte oder Statistiken
- Setze **wichtige Begriffe** und **Akteur*innen** fett
- Verwende Genderstern (*) bei Personenbezeichnungen
- Max 200 Wörter
- Keine Aufzählungen, keine Überschriften — reiner Fließtext
- Schreibe auf Deutsch
- Erwähne NUR Medien, Parteien und Akteur*innen aus dem Fokusland`,
      prompt: `Fokus: ${country} · ${snapshot.totalArticles} Artikel aus ${snapshot.sources.length} Quellen

HOT TOPIC:
${anchor.name} (${anchor.topic.articleCount} Artikel)
Top-Schlagzeilen:
${anchor.headlinesText}

Weitere Themen: ${formatOtherTopics(snapshot)}
${positionsText ? `\nGRÜNE POSITIONEN ZU "${theme.dominantTopic}" (nummerierte Quellen):\n${positionsText}` : ''}

Schreibe die KI-Einordnung zum Hot Topic "${theme.dominantTopic}".`,
      temperature: 0.4,
      maxOutputTokens: 1500,
    });

    // Leerer Text ist kein Fehler des SDK, aber einer für uns: ein Modell, das
    // sein ganzes Ausgabebudget in einen Denkblock steckt, liefert `''` und
    // käme sonst still als „Briefing" durch. Der catch unten hat die Heuristik.
    if (!result.text.trim()) throw new Error('leere Antwort vom Modell');
    log.info(`composeBriefing: ${result.text.split(/\s+/).length} words`);
    return result.text;
  } catch (error) {
    log.error(`composeBriefing failed: ${error}`);
    return `Die wichtigsten Themen heute: ${anchor.name} — ${anchor.headlinesText.split('\n')[0] ?? ''}`;
  }
}

// ─── Step 3b: tweet suggestions ──────────────────────────────────────

const TweetsSchema = z.object({
  tweets: z.array(monitorTweetSchema).min(1).max(3),
});

async function generateTweets(
  theme: Theme,
  anchor: HotTopicAnchor,
  positionsText: string
): Promise<MonitorHotTopicAnalysis['tweets']> {
  try {
    const result = await generateObject({
      model: getMonitorModel(),
      schema: TweetsSchema,
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
- Schreibe auf Deutsch`,
      prompt: `Erstelle 3 Tweet-Vorschläge zum Thema "${theme.dominantTopic}".

KONTEXT — Top-Schlagzeilen:
${anchor.headlinesText}
${positionsText ? `\nGRÜNE POSITIONEN (nutze diese für fundierte Tweets):\n${positionsText}` : ''}`,
      temperature: 0.6,
      maxOutputTokens: 2000,
    });

    const tweets = result.object.tweets.slice(0, 3);
    log.info(
      `generateTweets: ${tweets.length} tweets, chars: ${tweets.map((t) => t.text.length).join('/')}`
    );
    return tweets;
  } catch (error) {
    log.error(`generateTweets failed: ${toError(error).message}`);
    return [];
  }
}

// ─── Citation helpers ────────────────────────────────────────────────

export function mapCitations(citations: ResearchCitation[]): MonitorCitation[] {
  return citations.map((c) => ({
    id: String(c.id),
    title: c.title,
    url: c.url,
    snippet: c.snippet || '',
    ...(c.documentId && c.chunkIndex != null
      ? { documentId: c.documentId, chunkIndex: c.chunkIndex }
      : {}),
  }));
}

/**
 * Convert valid [N] markers to [cite:N] for CitationTextRenderer.
 *
 * The numbering arrives already deduplicated and renumbered from
 * `dedupeResearchSources` (researchOrchestrator), which also rewrote the
 * research answer's markers — so this stays a pure format conversion and must
 * not renumber anything itself.
 */
function applyCiteMarkers(text: string, citations: ResearchCitation[]): string {
  const validIds = new Set(citations.map((c) => String(c.id)));
  return text.replace(/\[(\d+)\]/g, (match, n: string) =>
    validIds.has(n) ? `[cite:${n}]` : match
  );
}

// ─── Public API ──────────────────────────────────────────────────────

function emptyAnalysis(): MonitorHotTopicAnalysis {
  return {
    dominantTopic: '',
    secondaryTopics: [],
    briefing: 'Keine Daten für das Briefing verfügbar.',
    tweets: [],
    positionsText: 'Keine Daten verfügbar.',
    citations: [],
    confidence: 'low',
    generatedAt: new Date().toISOString(),
    sourceFingerprint: '',
  };
}

export async function getHotTopicAnalysis(
  locale: MonitorLocale,
  snapshot: MonitorSnapshot,
  opts: { forceRefresh?: boolean } = {}
): Promise<MonitorHotTopicAnalysis> {
  const anchor = getHotTopicAnchor(snapshot);
  if (!anchor) {
    log.warn(`getHotTopicAnalysis(${locale}): no topics with articles`);
    return emptyAnalysis();
  }

  const key = cacheKey(locale);
  if (!opts.forceRefresh) {
    const cached = await getCachedJson(key, monitorHotTopicAnalysisSchema);
    if (cached) {
      if (isSameStory(cached.sourceFingerprint, anchor.fingerprint)) return cached;
      log.info(`getHotTopicAnalysis(${locale}): hot topic changed, regenerating`);
    }
  }

  log.info(`getHotTopicAnalysis(${locale}): generating for "${anchor.name}"`);
  const theme = await deriveTheme(anchor, snapshot.keywords);

  let research: ResearchResult;
  try {
    research = await researchPositions(theme, anchor);
    log.info(
      `researchPositions: ${research.citations.length} citations, confidence: ${research.confidence}`
    );
  } catch (error) {
    log.error(`researchPositions failed: ${toError(error).message}`);
    research = {
      answer: '',
      citations: [],
      followUpQuestions: [],
      searchSteps: [],
      confidence: 'low',
    };
  }

  const [briefing, tweets] = await Promise.all([
    composeBriefing(theme, anchor, snapshot, locale, research.answer),
    generateTweets(theme, anchor, research.answer),
  ]);

  const analysis: MonitorHotTopicAnalysis = {
    dominantTopic: theme.dominantTopic,
    secondaryTopics: theme.secondaryTopics,
    briefing: applyCiteMarkers(briefing, research.citations),
    tweets,
    positionsText: research.answer
      ? applyCiteMarkers(research.answer, research.citations)
      : `Keine Recherche-Ergebnisse zum Thema "${theme.dominantTopic}" gefunden.`,
    citations: mapCitations(research.citations),
    confidence: research.confidence,
    generatedAt: new Date().toISOString(),
    sourceFingerprint: anchor.fingerprint,
  };

  // Cache once the expensive parts (research + briefing) succeeded. Empty
  // tweets are acceptable in the cache — the UI shows placeholders — whereas
  // not caching would re-run the full research pipeline on every request of
  // either endpoint until tweets succeed.
  if (analysis.briefing && research.answer) {
    await setCachedJson(key, analysis, CACHE_TTL_SECONDS);
  }

  return analysis;
}

/**
 * Keyword Insights LangGraph Pipeline
 *
 * 3-node graph: clusterTopics → research → formatOutput
 * Uses AI to identify the dominant topic from keywords, then
 * executeResearch() for combined web + notebook search with synthesis.
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { generateObject } from 'ai';
import { z } from 'zod';

import { executeResearch } from '../../routes/chat/agents/directSearch.js';
import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';
import { getModel, isProviderConfigured } from '../ai/providers.js';

import type { KeywordEntry } from './types.js';
import type { ResearchCitation } from '../../routes/chat/agents/directSearch.js';

const log = createLogger('KeywordInsights');

const PROVIDER = isProviderConfigured('litellm') ? 'litellm' : 'mistral';
const CACHE_TTL_SECONDS = 7200;

// ─── Schemas ─────────────────────────────────────────────────────────

const TopicClusterSchema = z.object({
  dominantTopic: z
    .string()
    .describe('Name des dominierenden Themas, z.B. "Iran-Konflikt und Sicherheitspolitik"'),
  researchQuery: z
    .string()
    .describe(
      'Suchquery für Grüne-Positionen zu diesem Thema, z.B. "Grüne Position Iran Krieg Sicherheitspolitik NATO"'
    ),
  secondaryTopics: z.array(z.string()).describe('Weitere Themen, die nicht zum Hauptthema gehören'),
});

// ─── State ───────────────────────────────────────────────────────────

const InsightsStateAnnotation = Annotation.Root({
  locale: Annotation<string>({ reducer: (x, y) => y ?? x }),
  keywords: Annotation<KeywordEntry[]>({ reducer: (x, y) => y ?? x }),
  // Cluster
  dominantTopic: Annotation<string>({ reducer: (_, y) => y ?? '' }),
  researchQuery: Annotation<string>({ reducer: (_, y) => y ?? '' }),
  secondaryTopics: Annotation<string[]>({ reducer: (_, y) => y ?? [] }),
  // Research
  researchAnswer: Annotation<string>({ reducer: (_, y) => y ?? '' }),
  researchCitations: Annotation<ResearchCitation[]>({ reducer: (_, y) => y ?? [] }),
  confidence: Annotation<string>({ reducer: (_, y) => y ?? '' }),
  // Output
  finalText: Annotation<string>({ reducer: (_, y) => y ?? '' }),
});

type InsightsState = typeof InsightsStateAnnotation.State;

// ─── Node 1: AI clusters keywords into coherent topics ──────────────

async function clusterTopicsNode(state: InsightsState): Promise<Partial<InsightsState>> {
  const top10 = state.keywords.slice(0, 10);
  const keywordList = top10.map((k) => `${k.keyword} (${k.count}x)`).join(', ');

  try {
    const model = getModel(PROVIDER);
    const result = await generateObject({
      model,
      schema: TopicClusterSchema,
      system: `Du analysierst Keyword-Rankings aus deutschsprachigen Nachrichtenmedien und identifizierst das dominierende Thema.

REGELN:
- Gruppiere zusammengehörende Keywords zu einem Thema (z.B. "iran" + "krieg" + "nato" = "Iran-Konflikt")
- Das dominante Thema hat die höchste kombinierte Häufigkeit
- Erstelle eine Suchquery für Grüne-Parteipositionen zu diesem Thema
- Keywords die nicht zum Hauptthema passen → secondaryTopics`,
      prompt: `Diese Keywords dominieren aktuell die deutschen Nachrichtenmedien:\n\n${keywordList}\n\nIdentifiziere das dominierende Thema und erstelle eine Suchquery.`,
      temperature: 0.2,
    });

    log.info(
      `ClusterTopics: "${result.object.dominantTopic}" (query: "${result.object.researchQuery}"), secondary: [${result.object.secondaryTopics.join(', ')}]`
    );
    return {
      dominantTopic: result.object.dominantTopic,
      researchQuery: result.object.researchQuery,
      secondaryTopics: result.object.secondaryTopics,
    };
  } catch (error) {
    // Fallback: use top 3 keywords as query
    const fallbackQuery = top10
      .slice(0, 3)
      .map((k) => k.keyword)
      .join(' ');
    log.warn(`ClusterTopics failed, using fallback: "${fallbackQuery}"`);
    return {
      dominantTopic: top10[0]?.keyword ?? 'Unbekannt',
      researchQuery: `Grüne Position ${fallbackQuery}`,
      secondaryTopics: top10.slice(3, 6).map((k) => k.keyword),
    };
  }
}

// ─── Node 2: executeResearch (web + notebooks combined) ─────────────

async function researchNode(state: InsightsState): Promise<Partial<InsightsState>> {
  const allKeywords = state.keywords
    .slice(0, 10)
    .map((k) => k.keyword)
    .join(', ');

  const question = `Was haben Bündnis 90/Die Grünen in ihren Programmen und Beschlüssen zum Thema "${state.dominantTopic}" festgelegt?

Hintergrund: Die aktuellen Top-Themen in den deutschsprachigen Medien sind: ${allKeywords}.
Das dominierende Thema ist "${state.dominantTopic}". Weitere Themen: ${state.secondaryTopics.join(', ')}.

Fasse die bestehenden Grünen-Positionen zusammen. Verwende Vergangenheitsform ("Die Grünen haben gefordert...", "Im Programm hieß es..."). Erwähne auch kurz die Nebenthemen, falls relevante Positionen vorhanden sind.`;

  try {
    const result = await executeResearch({
      question,
      depth: 'quick',
      maxSources: 8,
      useLLMSynthesis: true,
    });

    log.info(`Research: ${result.citations.length} citations, confidence: ${result.confidence}`);
    return {
      researchAnswer: result.answer,
      researchCitations: result.citations,
      confidence: result.confidence,
    };
  } catch (error) {
    log.error(`Research failed: ${error}`);
    return {
      researchAnswer: `Keine Recherche-Ergebnisse zum Thema "${state.dominantTopic}" gefunden.`,
      researchCitations: [],
      confidence: 'low',
    };
  }
}

// ─── Node 3: Format output with citation data ───────────────────────

function formatOutputNode(state: InsightsState): Partial<InsightsState> {
  // The research answer already has [N] citation markers
  // Convert to [cite:N] for CitationTextRenderer
  let text = state.researchAnswer;

  // Replace [N] with [cite:N] for valid citations
  const validIds = new Set(state.researchCitations.map((c) => String(c.id)));
  text = text.replace(/\[(\d+)\]/g, (match, n) => {
    if (validIds.has(n)) return `[cite:${n}]`;
    return match;
  });

  log.info(`FormatOutput: ${validIds.size} citations, ${text.split(/\s+/).length} words`);
  return { finalText: text };
}

// ─── Graph ───────────────────────────────────────────────────────────

const graph = new StateGraph(InsightsStateAnnotation)
  .addNode('clusterTopics', clusterTopicsNode)
  .addNode('research', researchNode)
  .addNode('formatOutput', formatOutputNode)
  .addEdge('__start__', 'clusterTopics')
  .addEdge('clusterTopics', 'research')
  .addEdge('research', 'formatOutput')
  .addEdge('formatOutput', END)
  .compile();

// ─── Public API ──────────────────────────────────────────────────────

export interface KeywordInsightsResult {
  text: string;
  dominantTopic: string;
  secondaryTopics: string[];
  citations: Array<{
    index: string;
    cited_text: string;
    document_title: string;
    document_id: string;
    source_url: string | null;
    similarity_score: number;
    chunk_index: number;
    collection_id?: string;
    collection_name?: string;
  }>;
  sources: Array<{
    document_id: string;
    document_title: string;
    source_url: string | null;
  }>;
  confidence: string;
}

export async function generateKeywordInsights(
  keywords: KeywordEntry[],
  locale: string
): Promise<KeywordInsightsResult> {
  const cacheKey = `monitor:keyword-insights:${locale}`;

  // Check cache
  try {
    const cached = await redisClient.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {
    // Fall through
  }

  if (keywords.length === 0) {
    return {
      text: 'Keine Keywords verfügbar.',
      dominantTopic: '',
      secondaryTopics: [],
      citations: [],
      sources: [],
      confidence: 'low',
    };
  }

  try {
    const result = await graph.invoke({
      locale,
      keywords,
      dominantTopic: '',
      researchQuery: '',
      secondaryTopics: [],
      researchAnswer: '',
      researchCitations: [],
      confidence: '',
      finalText: '',
    });

    // Map ResearchCitations to the format CitationTextRenderer expects
    const citations = (result.researchCitations || []).map((c) => ({
      index: String(c.id),
      cited_text: c.snippet || '',
      document_title: c.title,
      document_id: c.url || '',
      source_url: c.url || null,
      similarity_score: 0,
      chunk_index: 0,
    }));

    const sources = (result.researchCitations || []).map((c) => ({
      document_id: c.url || '',
      document_title: c.title,
      source_url: c.url || null,
    }));

    const insights: KeywordInsightsResult = {
      text: result.finalText || 'Insights konnten nicht generiert werden.',
      dominantTopic: result.dominantTopic || '',
      secondaryTopics: result.secondaryTopics || [],
      citations,
      sources,
      confidence: result.confidence || 'low',
    };

    // Cache
    try {
      await redisClient.set(cacheKey, JSON.stringify(insights), { EX: CACHE_TTL_SECONDS });
    } catch {
      // Non-critical
    }

    return insights;
  } catch (error) {
    log.error(`KeywordInsights graph failed: ${error}`);
    return {
      text: 'Insights konnten nicht generiert werden.',
      dominantTopic: '',
      secondaryTopics: [],
      citations: [],
      sources: [],
      confidence: 'low',
    };
  }
}

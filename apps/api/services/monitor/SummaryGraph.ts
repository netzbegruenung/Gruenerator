/**
 * Monitor Summary LangGraph Pipeline
 *
 * 4-node graph: extract → qualityGate → synthesize → linkPost
 * Separates fact extraction (structured) from prose synthesis (creative)
 * and link formatting (deterministic code).
 */

import { StateGraph, Annotation, END } from '@langchain/langgraph';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getModel, isProviderConfigured } from '../ai/providers.js';

import type { MonitorArticle } from './types.js';

const log = createLogger('SummaryGraph');

const PROVIDER = isProviderConfigured('litellm') ? 'litellm' : 'mistral';

// ─── Schema ──────────────────────────────────────────────────────────

const ExtractedFactSchema = z.object({
  actor: z.string().describe('Name der Person oder Organisation (nur wenn im Artikel genannt)'),
  action: z.string().describe('Was tut oder sagt die Person (kurzer Satz)'),
  context: z.string().describe('Thematischer Kontext (z.B. "zum Sondervermögen")'),
  sourceUrl: z.string().describe('URL des Artikels'),
  sourceName: z.string().describe('Name der Quelle (z.B. "taz", "Deutschlandfunk")'),
});

const ExtractionResultSchema = z.object({
  facts: z.array(ExtractedFactSchema).describe('Extrahierte Fakten aus den Artikeln'),
});

type ExtractedFact = z.infer<typeof ExtractedFactSchema>;

// ─── State ───────────────────────────────────────────────────────────

const SummaryStateAnnotation = Annotation.Root({
  entityLabel: Annotation<string>({ reducer: (x, y) => y ?? x }),
  summaryPrompt: Annotation<string>({ reducer: (x, y) => y ?? x }),
  articles: Annotation<MonitorArticle[]>({ reducer: (x, y) => y ?? x }),
  facts: Annotation<ExtractedFact[]>({ reducer: (_, y) => y }),
  extractAttempts: Annotation<number>({ reducer: (x, y) => (x || 0) + (y || 0) }),
  qualityPass: Annotation<boolean>({ reducer: (_, y) => y }),
  summaryText: Annotation<string>({ reducer: (_, y) => y ?? '' }),
  attackAnalysis: Annotation<string>({ reducer: (_, y) => y ?? '' }),
  finalMarkdown: Annotation<string>({ reducer: (_, y) => y ?? '' }),
});

type SummaryState = typeof SummaryStateAnnotation.State;

// ─── Nodes ───────────────────────────────────────────────────────────

async function extractNode(state: SummaryState): Promise<Partial<SummaryState>> {
  const top = state.articles.slice(0, 15);
  const formatted = top
    .map((a) => `Titel: ${a.title}\nURL: ${a.url}\nQuelle: ${a.source}\n${a.excerpt}`)
    .join('\n---\n');

  try {
    const model = getModel(PROVIDER);
    const result = await generateObject({
      model,
      schema: ExtractionResultSchema,
      system: `Du extrahierst Fakten aus deutschsprachigen Nachrichtenartikeln über ${state.entityLabel}.

REGELN:
- Extrahiere NUR Fakten, die WÖRTLICH im Artikeltext stehen
- ERFINDE NIEMALS Vornamen! Wenn im Text nur "Hofreiter" steht, schreibe "Hofreiter" — NICHT "Boris Hofreiter" oder "Anton Hofreiter"
- Wenn nur ein Nachname genannt wird, verwende NUR den Nachnamen ohne Vorname
- Erfinde KEINE Titel, Rollen oder Funktionen die nicht im Text stehen
- Jeder Fakt muss eine sourceUrl haben
- Maximal 10 Fakten, die wichtigsten zuerst`,
      prompt: `Extrahiere die wichtigsten Fakten aus diesen ${top.length} Artikeln über ${state.entityLabel}:\n\n${formatted}`,
      temperature: 0.1,
    });

    log.info(
      `Extract: ${result.object.facts.length} facts from ${top.length} articles (attempt ${(state.extractAttempts || 0) + 1})`
    );
    return { facts: result.object.facts, extractAttempts: 1 };
  } catch (error) {
    log.error(`Extract failed: ${error}`);
    return { facts: [], extractAttempts: 1 };
  }
}

function qualityGateNode(state: SummaryState): Partial<SummaryState> {
  const factsWithActors = state.facts.filter((f) => f.actor.length > 1);
  const pass = state.facts.length >= 3 && factsWithActors.length >= 2;

  if (!pass && (state.extractAttempts || 0) < 2) {
    log.info(
      `QualityGate: FAIL (${state.facts.length} facts, ${factsWithActors.length} with actors) — retrying`
    );
  } else {
    log.info(
      `QualityGate: PASS (${state.facts.length} facts, ${factsWithActors.length} with actors)`
    );
  }

  return { qualityPass: pass || (state.extractAttempts || 0) >= 2 };
}

async function synthesizeNode(state: SummaryState): Promise<Partial<SummaryState>> {
  if (state.facts.length === 0) {
    return {
      summaryText: `Keine relevanten Fakten über ${state.entityLabel} in der aktuellen Berichterstattung gefunden.`,
    };
  }

  const factsFormatted = state.facts
    .map((f) => `- ${f.actor}: ${f.action} (${f.context}) [${f.sourceName}]`)
    .join('\n');

  try {
    const model = getModel(PROVIDER);
    const result = await generateText({
      model,
      system: `Du bist ein*e neutrale*r Medienanalyst*in. Schreibe auf Deutsch mit Genderstern (*).

Politischer Kontext (Stand März 2026):
- Bundeskanzler: Friedrich Merz (CDU), Koalition: CDU/CSU + SPD
- Bündnis 90/Die Grünen sind Oppositionspartei im Bundestag
- Grüne Bundesvorsitzende: Felix Banaszak und Franziska Brantner

WICHTIG:
- Verwende NUR die unten genannten Fakten. Erfinde NICHTS dazu.
- Wenn ein Name nur als Nachname angegeben ist (z.B. "Hofreiter"), schreibe NUR den Nachnamen. Erfinde NIEMALS einen Vornamen dazu.`,
      prompt: `Schreibe ein Medien-Briefing über ${state.entityLabel} basierend auf diesen verifizierten Fakten:

${factsFormatted}

Regeln:
- Max 200 Wörter, kurze Absätze (2-3 Sätze)
- Setze wichtige **Namen** und **Schlüsselbegriffe** fett
- Neutral und analytisch, keine Parteinahme
- Fließtext, keine Aufzählungen oder Überschriften`,
      temperature: 0.3,
      maxTokens: 2000,
    });

    log.info(`Synthesize: ${result.text.split(/\s+/).length} words`);
    return { summaryText: result.text };
  } catch (error) {
    log.error(`Synthesize failed: ${error}`);
    const fallback = state.facts
      .slice(0, 8)
      .map((f) => `**${f.actor}** ${f.action} (${f.sourceName})`)
      .join('\n\n');
    return { summaryText: fallback };
  }
}

async function attackAnalysisNode(state: SummaryState): Promise<Partial<SummaryState>> {
  if (state.facts.length < 3) {
    return { attackAnalysis: '' };
  }

  // Extract key themes from facts for notebook search
  const themes = [...new Set(state.facts.map((f) => f.context).filter(Boolean))].slice(0, 5);
  const factsFormatted = state.facts
    .slice(0, 10)
    .map((f) => `- ${f.actor}: ${f.action} (${f.context})`)
    .join('\n');

  // Search party documents for our positions on these themes
  let positionsContext = '';
  try {
    const { executeDirectSearch } = await import('../../routes/chat/agents/directSearch.js');
    const searchPromises = themes.map((theme) =>
      executeDirectSearch({ query: theme, collection: 'deutschland', limit: 2 }).catch(() => ({
        results: [],
      }))
    );
    const searchResults = await Promise.all(searchPromises);
    const positions = searchResults
      .flatMap((r) => r.results || [])
      .filter((r) => (r.score ?? 0) > 0.4)
      .slice(0, 6);

    if (positions.length > 0) {
      positionsContext =
        '\n\nRelevante Grüne Positionen aus Parteiprogrammen:\n' +
        positions.map((p) => `- "${p.source}": ${(p.excerpt || '').slice(0, 200)}`).join('\n');
    }
  } catch {
    // Non-critical, continue without positions
  }

  try {
    const model = getModel(PROVIDER);
    const result = await generateText({
      model,
      system: `Du bist ein*e erfahrene*r politische*r Strategieberater*in. Du vergleichst aktuelle Medienberichterstattung mit den offiziellen Positionen von Bündnis 90/Die Grünen.

Politischer Kontext (Stand März 2026):
- Bundeskanzler: Friedrich Merz (CDU), Koalition: CDU/CSU + SPD
- Bündnis 90/Die Grünen sind Oppositionspartei im Bundestag

Schreibe auf Deutsch mit Genderstern (*). Sei direkt und konkret.`,
      prompt: `Aktuelle Berichterstattung über ${state.entityLabel}:

${factsFormatted}
${positionsContext}

Vergleiche die aktuelle Berichterstattung mit unseren Positionen und analysiere:

**Angriffsflächen** — Wo könnten politische Gegner*innen die Grünen angreifen? Wo haben wir schwache oder fehlende Positionen zu den aktuellen Themen? (2-3 Stichpunkte)

**Chancen** — Wo können die Grünen in die Offensive gehen? Wo haben wir starke Positionen, die zur aktuellen Debatte passen und die Regierung angreifbar machen? (2-3 Stichpunkte)

Max 150 Wörter. Stichpunkte mit Spiegelstrichen.`,
      temperature: 0.4,
      maxTokens: 1000,
    });

    log.info(
      `AttackAnalysis: ${result.text.split(/\s+/).length} words (${positionsContext ? 'with' : 'without'} positions)`
    );
    return { attackAnalysis: result.text };
  } catch (error) {
    log.error(`AttackAnalysis failed: ${error}`);
    return { attackAnalysis: '' };
  }
}

function linkPostNode(state: SummaryState): Partial<SummaryState> {
  let text = state.summaryText;
  const linkedUrls = new Set<string>();

  for (const fact of state.facts) {
    if (linkedUrls.has(fact.sourceUrl)) continue;

    // Try to find the actor name in the text and link it
    const keywords = [fact.actor, ...fact.action.split(' ').filter((w) => w.length > 5)];
    for (const keyword of keywords) {
      if (!keyword || keyword.length < 3) continue;

      // Escape regex special chars
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match keyword not already inside a markdown link
      const regex = new RegExp(`(?<!\\[)\\b(${escaped})\\b(?![^\\[]*\\])`, 'i');
      const match = text.match(regex);

      if (match && match.index !== undefined) {
        const original = match[1];
        text =
          text.slice(0, match.index) +
          `[${original}](${fact.sourceUrl})` +
          text.slice(match.index + original.length);
        linkedUrls.add(fact.sourceUrl);
        break;
      }
    }
  }

  log.info(`LinkPost: ${linkedUrls.size} links inserted`);
  return { finalMarkdown: text };
}

// ─── Graph ───────────────────────────────────────────────────────────

function routeAfterQualityGate(state: SummaryState): 'extract' | 'synthesize' {
  if (!state.qualityPass && (state.extractAttempts || 0) < 2) return 'extract';
  return 'synthesize';
}

const graph = new StateGraph(SummaryStateAnnotation)
  .addNode('extract', extractNode)
  .addNode('qualityGate', qualityGateNode)
  .addNode('synthesize', synthesizeNode)
  .addNode('analyzeAttacks', attackAnalysisNode)
  .addNode('linkPost', linkPostNode)
  .addEdge('__start__', 'extract')
  .addEdge('extract', 'qualityGate')
  .addConditionalEdges('qualityGate', routeAfterQualityGate)
  .addEdge('synthesize', 'analyzeAttacks')
  .addEdge('analyzeAttacks', 'linkPost')
  .addEdge('linkPost', END)
  .compile();

// ─── Public API ──────────────────────────────────────────────────────

export interface EntitySummaryGraphResult {
  summary: string;
  attackAnalysis: string;
}

export async function generateEntitySummary(
  entityLabel: string,
  summaryPrompt: string,
  articles: MonitorArticle[]
): Promise<EntitySummaryGraphResult> {
  if (articles.length === 0) {
    return { summary: `Keine aktuellen Artikel über ${entityLabel} gefunden.`, attackAnalysis: '' };
  }

  try {
    const result = await graph.invoke({
      entityLabel,
      summaryPrompt,
      articles,
      facts: [],
      extractAttempts: 0,
      qualityPass: false,
      summaryText: '',
      attackAnalysis: '',
      finalMarkdown: '',
    });

    return {
      summary:
        result.finalMarkdown ||
        result.summaryText ||
        `Zusammenfassung für ${entityLabel} konnte nicht erstellt werden.`,
      attackAnalysis: result.attackAnalysis || '',
    };
  } catch (error) {
    log.error(`SummaryGraph failed for ${entityLabel}: ${error}`);
    const fallback = articles
      .slice(0, 8)
      .map((a) => `- ${a.title} (${a.source})`)
      .join('\n');
    return {
      summary: `**${articles.length} Artikel über ${entityLabel}:**\n\n${fallback}`,
      attackAnalysis: '',
    };
  }
}

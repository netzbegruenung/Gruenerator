/**
 * Monitor entity summary pipeline.
 *
 * extract (with quality-gated retry) → [synthesize ∥ analyzeAttacks] → linkPost.
 * Separates fact extraction (structured) from prose synthesis (creative)
 * and link formatting (deterministic code). Plain async functions — the
 * previous LangGraph wrapper used none of its features.
 */

import { generateObject, generateText } from 'ai';
import { z } from 'zod';

import { createLogger } from '../../utils/logger.js';
import { getModel, getPreferredMonitorProvider } from '../ai/providers.js';

import type { MonitorArticle } from './types.js';

const log = createLogger('SummaryGraph');

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

export const RiskItemSchema = z.object({
  title: z.string().describe('Kurze Überschrift des Risikos/der Chance (max 10 Wörter)'),
  source: z.string().describe('Quelle: Medium oder Institution (z.B. "Bundestag", "Weser-Kurier")'),
  reasoning: z.string().describe('Begründung in 1-2 Sätzen'),
  severity: z.enum(['high', 'medium', 'low']).describe('Dringlichkeit/Potenzial'),
});

export const RiskAnalysisSchema = z.object({
  risks: z.array(RiskItemSchema).describe('2-3 konkrete Risiken, sortiert nach Dringlichkeit'),
  opportunities: z.array(RiskItemSchema).describe('2-3 konkrete Chancen, sortiert nach Potenzial'),
});

export type RiskItem = z.infer<typeof RiskItemSchema>;
export type RiskAnalysis = z.infer<typeof RiskAnalysisSchema>;

// ─── Step 1: fact extraction (retried via quality gate) ──────────────

async function extractFacts(
  entityLabel: string,
  articles: MonitorArticle[],
  attempt: number
): Promise<ExtractedFact[]> {
  const top = articles.slice(0, 15);
  const formatted = top
    .map((a) => `Titel: ${a.title}\nURL: ${a.url}\nQuelle: ${a.source}\n${a.excerpt}`)
    .join('\n---\n');

  try {
    const result = await generateObject({
      model: getModel(getPreferredMonitorProvider()),
      schema: ExtractionResultSchema,
      system: `Du extrahierst Fakten aus deutschsprachigen Nachrichtenartikeln über ${entityLabel}.

REGELN:
- Extrahiere NUR Fakten, die WÖRTLICH im Artikeltext stehen
- ERFINDE NIEMALS Vornamen! Wenn im Text nur "Hofreiter" steht, schreibe "Hofreiter" — NICHT "Boris Hofreiter" oder "Anton Hofreiter"
- Wenn nur ein Nachname genannt wird, verwende NUR den Nachnamen ohne Vorname
- Erfinde KEINE Titel, Rollen oder Funktionen die nicht im Text stehen
- Jeder Fakt muss eine sourceUrl haben
- Maximal 10 Fakten, die wichtigsten zuerst`,
      prompt: `Extrahiere die wichtigsten Fakten aus diesen ${top.length} Artikeln über ${entityLabel}:\n\n${formatted}`,
      temperature: 0.1,
    });

    log.info(
      `Extract: ${result.object.facts.length} facts from ${top.length} articles (attempt ${attempt})`
    );
    return result.object.facts;
  } catch (error) {
    log.error(`Extract failed: ${error}`);
    return [];
  }
}

function passesQualityGate(facts: ExtractedFact[]): boolean {
  const factsWithActors = facts.filter((f) => f.actor.length > 1);
  return facts.length >= 3 && factsWithActors.length >= 2;
}

// ─── Step 2a: prose synthesis ────────────────────────────────────────

async function synthesize(entityLabel: string, facts: ExtractedFact[]): Promise<string> {
  if (facts.length === 0) {
    return `Keine relevanten Fakten über ${entityLabel} in der aktuellen Berichterstattung gefunden.`;
  }

  const factsFormatted = facts
    .map((f) => `- ${f.actor}: ${f.action} (${f.context}) [${f.sourceName}]`)
    .join('\n');

  try {
    const result = await generateText({
      model: getModel(getPreferredMonitorProvider()),
      system: `Du bist ein*e neutrale*r Medienanalyst*in. Schreibe auf Deutsch mit Genderstern (*).

Politischer Kontext (Stand März 2026):
- Bundeskanzler: Friedrich Merz (CDU), Koalition: CDU/CSU + SPD
- Bündnis 90/Die Grünen sind Oppositionspartei im Bundestag
- Grüne Bundesvorsitzende: Felix Banaszak und Franziska Brantner

WICHTIG:
- Verwende NUR die unten genannten Fakten. Erfinde NICHTS dazu.
- Wenn ein Name nur als Nachname angegeben ist (z.B. "Hofreiter"), schreibe NUR den Nachnamen. Erfinde NIEMALS einen Vornamen dazu.`,
      prompt: `Schreibe ein Medien-Briefing über ${entityLabel} basierend auf diesen verifizierten Fakten:

${factsFormatted}

Regeln:
- Max 200 Wörter, kurze Absätze (2-3 Sätze)
- Setze wichtige **Namen** und **Schlüsselbegriffe** fett
- Neutral und analytisch, keine Parteinahme
- Fließtext, keine Aufzählungen oder Überschriften`,
      temperature: 0.3,
      maxOutputTokens: 2000,
    });

    log.info(`Synthesize: ${result.text.split(/\s+/).length} words`);
    return result.text;
  } catch (error) {
    log.error(`Synthesize failed: ${error}`);
    return facts
      .slice(0, 8)
      .map((f) => `**${f.actor}** ${f.action} (${f.sourceName})`)
      .join('\n\n');
  }
}

// ─── Step 2b: risk/opportunity analysis ──────────────────────────────

function buildRiskContext(articles: MonitorArticle[]): string {
  const lines: string[] = [];

  // Topic distribution
  const topicCounts: Record<string, number> = {};
  for (const a of articles) {
    if (a.primaryTopic) topicCounts[a.primaryTopic] = (topicCounts[a.primaryTopic] ?? 0) + 1;
  }
  const topTopics = Object.entries(topicCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([k, v]) => `${k} (${v})`);
  if (topTopics.length > 0) lines.push(`Themen: ${topTopics.join(', ')}`);

  // Top keywords
  const nounCounts: Record<string, number> = {};
  for (const a of articles) {
    for (const n of a.topNouns ?? []) {
      nounCounts[n.noun] = (nounCounts[n.noun] ?? 0) + n.count;
    }
  }
  const topKw = Object.entries(nounCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([k]) => k);
  if (topKw.length > 0) lines.push(`Schlagwörter: ${topKw.join(', ')}`);

  return lines.join('\n');
}

interface AttackAnalysis {
  attackAnalysis: string;
  riskAnalysis: RiskAnalysis | null;
}

async function analyzeAttacks(
  entityLabel: string,
  facts: ExtractedFact[],
  articles: MonitorArticle[]
): Promise<AttackAnalysis> {
  if (facts.length < 3) {
    return { attackAnalysis: '', riskAnalysis: null };
  }

  // Build risk context from article metadata
  const riskContext = buildRiskContext(articles);

  // Extract key themes from facts for notebook search
  const themes = [...new Set(facts.map((f) => f.context).filter(Boolean))].slice(0, 5);
  const factsFormatted = facts
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
        '\nRelevante Grüne Positionen aus Parteiprogrammen:\n' +
        positions.map((p) => `- "${p.source}": ${(p.excerpt || '').slice(0, 200)}`).join('\n');
    }
  } catch {
    // Non-critical, continue without positions
  }

  try {
    const result = await generateObject({
      model: getModel(getPreferredMonitorProvider()),
      schema: RiskAnalysisSchema,
      system: `Du bist ein*e politische*r Risikoanalyst*in für Bündnis 90/Die Grünen.

Politischer Kontext (Stand März 2026):
- Bundeskanzler: Friedrich Merz (CDU), Koalition: CDU/CSU + SPD
- Bündnis 90/Die Grünen sind Oppositionspartei im Bundestag

Schreibe auf Deutsch mit Genderstern (*). Sei direkt und konkret.`,
      prompt: `RISIKO-DATEN:
${riskContext || 'Keine Daten verfügbar.'}

EXTRAHIERTE FAKTEN über ${entityLabel}:
${factsFormatted}
${positionsContext}

Analysiere die Berichterstattung und identifiziere:
- 2-3 konkrete Risiken (Angriffsflächen, negative Berichterstattung, fehlende Positionen)
- 2-3 konkrete Chancen (positive Themen, starke Positionen, Verstärkungspotenzial)

Jedes Item braucht: kurze Überschrift, Quelle, Begründung, Dringlichkeit (high/medium/low).`,
      temperature: 0.3,
      maxOutputTokens: 1500,
    });

    const analysis = result.object;
    log.info(
      `RiskAnalysis: ${analysis.risks.length} risks, ${analysis.opportunities.length} opportunities (${positionsContext ? 'with' : 'without'} positions)`
    );

    // Keep backward-compatible markdown in attackAnalysis
    const markdown = [
      '**Risiken**',
      ...analysis.risks.map((r) => `- **${r.title}** (${r.source}) — ${r.reasoning}`),
      '',
      '**Chancen**',
      ...analysis.opportunities.map((o) => `- **${o.title}** (${o.source}) — ${o.reasoning}`),
    ].join('\n');

    return { attackAnalysis: markdown, riskAnalysis: analysis };
  } catch (error) {
    log.error(`RiskAnalysis failed: ${error}`);
    return { attackAnalysis: '', riskAnalysis: null };
  }
}

// ─── Step 3: deterministic source linking ────────────────────────────

function linkPost(summaryText: string, facts: ExtractedFact[]): string {
  let text = summaryText;
  const linkedUrls = new Set<string>();

  for (const fact of facts) {
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
  return text;
}

// ─── Public API ──────────────────────────────────────────────────────

export interface EntitySummaryGraphResult {
  summary: string;
  attackAnalysis: string;
  riskAnalysis: RiskAnalysis | null;
}

export async function generateEntitySummary(
  entityLabel: string,
  articles: MonitorArticle[]
): Promise<EntitySummaryGraphResult> {
  if (articles.length === 0) {
    return {
      summary: `Keine aktuellen Artikel über ${entityLabel} gefunden.`,
      attackAnalysis: '',
      riskAnalysis: null,
    };
  }

  try {
    let facts: ExtractedFact[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      facts = await extractFacts(entityLabel, articles, attempt);
      if (passesQualityGate(facts)) break;
      if (attempt < 2) log.info('QualityGate: FAIL — retrying extraction');
    }
    log.info(
      `QualityGate: ${passesQualityGate(facts) ? 'PASS' : 'GIVING UP'} (${facts.length} facts)`
    );

    // Synthesis and risk analysis only depend on the facts — run them in parallel.
    const [summaryText, attack] = await Promise.all([
      synthesize(entityLabel, facts),
      analyzeAttacks(entityLabel, facts, articles),
    ]);

    return {
      summary:
        linkPost(summaryText, facts) ||
        `Zusammenfassung für ${entityLabel} konnte nicht erstellt werden.`,
      attackAnalysis: attack.attackAnalysis,
      riskAnalysis: attack.riskAnalysis,
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
      riskAnalysis: null,
    };
  }
}

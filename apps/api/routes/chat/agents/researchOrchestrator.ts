/**
 * Research Orchestrator
 *
 * Perplexity-style structured research pipeline: plan searches, execute them
 * in parallel, deduplicate and diversify sources, then synthesize a coherent
 * answer with inline citations and follow-up questions.
 */

import { generateObject, generateText } from 'ai';
import { z } from 'zod';

import {
  validateCitations,
  stripUngroundedCitations,
} from '../../../services/search/CitationGrounder.js';
import { applyMMR } from '../../../services/search/DiversityReranker.js';
import { expandQuery } from '../../../services/search/QueryExpansionService.js';
import { createLogger } from '../../../utils/logger.js';
import { type AIWorkerPool } from '../../../workers/types.js';

import { executeDirectSearch, executeDirectWebSearch } from './directSearchExecutors.js';
import { getIntermediateModel } from './providers.js';
import { truncateText, deduplicateByUrl } from './searchFormatting.js';

export type ResearchLocale = 'de' | 'at' | 'eu';
export type ReportShape = 'biographical' | 'comparative' | 'positional' | 'event' | 'general';

export const DeepPlanSchema = z.object({
  subQuestions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        sources: z.array(z.enum(['web', 'qdrant'])).min(1),
      })
    )
    .min(2)
    .max(6),
  locale: z.enum(['de', 'at', 'eu']),
  reportShape: z.enum(['biographical', 'comparative', 'positional', 'event', 'general']),
});

type DeepPlan = z.infer<typeof DeepPlanSchema>;

const QualityAssessmentSchema = z.object({
  score: z.number().int().min(1).max(5),
  weakAspects: z.array(z.string()).max(4).optional(),
});

const log = createLogger('DirectSearch');

export interface ResearchCitation {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
}

export interface ResearchResult {
  answer: string;
  citations: ResearchCitation[];
  followUpQuestions: string[];
  searchSteps: Array<{
    tool: string;
    query: string;
    resultsCount: number;
  }>;
  confidence: 'high' | 'medium' | 'low';
}

interface SearchPlan {
  queries: Array<{
    tool: 'web_search' | 'gruenerator_search';
    query: string;
    priority: number;
    reason: string;
  }>;
  synthesisStrategy: string;
}

interface CollectedSource {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  relevance: number;
  sourceType: 'web' | 'document' | 'person';
}

/**
 * Plan research by analyzing the question and determining search strategy.
 * Uses heuristics to decide which sources to query.
 */
function planResearch(question: string): SearchPlan {
  const q = question.toLowerCase();
  const queries: SearchPlan['queries'] = [];

  // Detect question type
  const isPartyQuery = /\b(grüne|partei|programm|position|wahlprogramm|beschluss|antrag)\b/i.test(
    q
  );
  const isCurrentEvents = /\b(aktuell|heute|gestern|diese woche|kürzlich|news|nachricht)\b/i.test(
    q
  );
  const isLocalQuery = /\b(ort|stadt|stadtteil|region|gemeinde|kreis|wahlkreis)\b/i.test(q);

  // Priority 2: Party documents for policy questions
  if (isPartyQuery && !isCurrentEvents) {
    queries.push({
      tool: 'gruenerator_search',
      query: question,
      priority: 2,
      reason: 'Query relates to party positions/programs',
    });
  }

  // Priority 3: Web search for current events or supplementary info
  if (isCurrentEvents || queries.length === 0) {
    queries.push({
      tool: 'web_search',
      query: question,
      priority: isCurrentEvents ? 1 : 3,
      reason: isCurrentEvents ? 'Query about current events' : 'General information search',
    });
  }

  // Add local/geographic web search if location mentioned
  if (isLocalQuery && !queries.some((q) => q.tool === 'web_search')) {
    queries.push({
      tool: 'web_search',
      query: question,
      priority: 2,
      reason: 'Local/geographic information needed',
    });
  }

  // Sort by priority
  queries.sort((a, b) => a.priority - b.priority);

  return {
    queries,
    synthesisStrategy: isPartyQuery ? 'policy_overview' : 'factual_synthesis',
  };
}

/**
 * Deep-research planner. Decomposes the question into 3–6 sub-questions, infers
 * the country scope (de/at/eu) and the report shape (biographical/comparative/etc.).
 * Used only for `complex` complexity to keep latency bounded for simpler queries.
 */
async function planResearchDeep(
  question: string,
  defaultLocale: ResearchLocale,
  brief?: string | null
): Promise<DeepPlan | null> {
  const aiModel = getIntermediateModel();
  const briefLine = brief ? `\nKontext-Briefing: ${brief}` : '';

  try {
    const result = await generateObject({
      model: aiModel,
      schema: DeepPlanSchema,
      system: `Du planst eine vertiefte Recherche zu Fragen rund um die Grünen (Deutschland und Österreich).

Aufgabe: Zerlege die Nutzerfrage in 3–6 Sub-Fragen, die zusammen das Thema gut abdecken.
- Jede Sub-Frage adressiert einen eigenen Aspekt (z.B. Biografie, Karriere, Positionen, Aktuelles, Kontroversen, Vergleiche).
- WICHTIG: Jede Sub-Frage MUSS die zentrale Entität (Person, Partei, Thema, Ereignis) aus der Nutzerfrage explizit nennen. Schreibe z.B. "Welche politischen Positionen vertritt Mona Neubaur?" — NICHT "Welche politischen Positionen?". Sonst liefern Suchmaschinen ohne Kontext irrelevante Treffer.
- Pro Sub-Frage wähle die passende Quellenart: 'qdrant' für Parteipositionen/Beschlüsse/interne Dokumente, 'web' für Aktuelles/Personen/externe Fakten.
- Bestimme die Sprache/Land:
  * 'at' wenn Österreich-Bezug (z.B. Werner Kogler, Leonore Gewessler, .at-Domain, "Österreich")
  * 'de' wenn Deutschland-Bezug (z.B. Bundestag, Habeck, Merz)
  * 'eu' nur wenn explizit EU-weit
- Bestimme die Berichtsform:
  * 'biographical' für Personenfragen ("wer ist X")
  * 'comparative' für Vergleiche ("X vs Y", "Unterschiede")
  * 'positional' für Themenfragen ("Position zu X", "wie steht Partei zu Y")
  * 'event' für Ereignisse/Aktuelles
  * 'general' als Default

Gib NUR JSON zurück, das dem Schema entspricht.`,
      prompt: `Nutzerfrage: ${question}${briefLine}\n\nDefault-Land: ${defaultLocale}`,
      temperature: 0.2,
    });

    log.info(
      `[Research] LLM plan: ${result.object.subQuestions.length} sub-questions, locale=${result.object.locale}, shape=${result.object.reportShape}`
    );
    return result.object;
  } catch (error) {
    log.warn(
      `[Research] Deep planner failed, falling back to heuristic: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Map a research locale to (Qdrant collection, SearXNG language) tuples.
 */
export function localeToSearchScope(locale: ResearchLocale): {
  qdrantCollection: string;
  webLanguage: string;
} {
  switch (locale) {
    case 'at':
      return { qdrantCollection: 'oesterreich', webLanguage: 'de-AT' };
    case 'eu':
      return { qdrantCollection: 'deutschland', webLanguage: 'de-DE' };
    case 'de':
    default:
      return { qdrantCollection: 'deutschland', webLanguage: 'de-DE' };
  }
}

/**
 * Execute a deep-research plan: fan out one mini-search per sub-question, with
 * locale-scoped collections and SearXNG language.
 */
async function executeDeepSearches(
  plan: DeepPlan,
  aiWorkerPool?: AIWorkerPool,
  startSourceId = 1
): Promise<{ sources: CollectedSource[]; searchSteps: ResearchResult['searchSteps'] }> {
  const sources: CollectedSource[] = [];
  const searchSteps: ResearchResult['searchSteps'] = [];
  let sourceId = startSourceId;
  const { qdrantCollection, webLanguage } = localeToSearchScope(plan.locale);

  // Fan out all sub-questions in parallel — each may target web, qdrant, or both.
  const tasks = plan.subQuestions.flatMap((sq) => {
    const subTasks: Array<Promise<{ kind: 'web' | 'doc'; query: string; data: unknown }>> = [];
    if (sq.sources.includes('web')) {
      subTasks.push(
        executeDirectWebSearch({
          query: sq.question,
          searchType: 'general',
          maxResults: 4,
          language: webLanguage,
        })
          .then((data) => ({ kind: 'web' as const, query: sq.question, data }))
          .catch((err: unknown) => {
            log.warn(
              `[Research] Web sub-search failed for "${sq.question}": ${err instanceof Error ? err.message : String(err)}`
            );
            return { kind: 'web' as const, query: sq.question, data: null };
          })
      );
    }
    if (sq.sources.includes('qdrant')) {
      subTasks.push(
        executeDirectSearch({
          query: sq.question,
          collection: qdrantCollection,
          limit: 4,
        })
          .then((data) => ({ kind: 'doc' as const, query: sq.question, data }))
          .catch((err: unknown) => {
            log.warn(
              `[Research] Qdrant sub-search failed for "${sq.question}": ${err instanceof Error ? err.message : String(err)}`
            );
            return { kind: 'doc' as const, query: sq.question, data: null };
          })
      );
    }
    return subTasks;
  });

  // Light query expansion for web variants (only when a worker pool is available)
  // is intentionally skipped here — we already have N sub-questions. Adding 2-3
  // variants per sub-question would explode the request count past budget.

  const results = await Promise.all(tasks);

  for (const { kind, query, data } of results) {
    if (!data) continue;
    if (kind === 'web') {
      const web = data as Awaited<ReturnType<typeof executeDirectWebSearch>>;
      searchSteps.push({ tool: 'web_search', query, resultsCount: web.resultsCount });
      for (const result of web.results) {
        sources.push({
          id: sourceId++,
          title: result.title,
          url: result.url,
          domain: result.domain,
          snippet: result.snippet,
          relevance: 1 - (result.rank - 1) * 0.1,
          sourceType: 'web',
        });
      }
    } else {
      const doc = data as Awaited<ReturnType<typeof executeDirectSearch>>;
      searchSteps.push({
        tool: 'gruenerator_search',
        query,
        resultsCount: doc.resultsCount,
      });
      for (const result of doc.results) {
        sources.push({
          id: sourceId++,
          title: result.source,
          url: result.url || '',
          domain: plan.locale === 'at' ? 'gruene.at' : 'gruene.de',
          snippet: result.excerpt,
          relevance:
            result.relevance === 'Sehr hoch' ? 0.9 : result.relevance === 'Hoch' ? 0.7 : 0.5,
          sourceType: 'document',
        });
      }
    }
  }

  // aiWorkerPool currently unused in deep mode — kept in signature for symmetry
  // with executeSearches and in case we later want light expansion on weak aspects.
  void aiWorkerPool;

  const uniqueSources = deduplicateByUrl(sources, (s) => s.url || undefined);
  uniqueSources.sort((a, b) => b.relevance - a.relevance);
  return { sources: uniqueSources, searchSteps };
}

/**
 * Lightweight coverage assessor mirroring the qualityGateNode logic, but
 * standalone (not coupled to ChatGraphState). Decides if a refinement round
 * is warranted and returns the weak aspects to target.
 */
async function assessCoverage(
  question: string,
  sources: CollectedSource[]
): Promise<{ score: number; weakAspects: string[] }> {
  if (sources.length <= 1) return { score: 1, weakAspects: [] };

  const aiModel = getIntermediateModel();
  const summary = sources
    .slice(0, 8)
    .map((s, i) => `[${i + 1}] ${s.title}: ${truncateText(s.snippet, 150)}`)
    .join('\n');

  try {
    const result = await generateObject({
      model: aiModel,
      schema: QualityAssessmentSchema,
      system: `Du bewertest, ob Suchergebnisse eine Recherche-Frage ausreichend abdecken.
Bewerte Abdeckung 1–5 (5 = vollständig, 3 = lückenhaft, 1 = unzureichend).
Wenn lückenhaft: nenne 1–3 schwach abgedeckte Aspekte als kurze Suchphrasen (nicht ganze Fragen).`,
      prompt: `Frage: ${question}\n\nErgebnisse:\n${summary}`,
      temperature: 0.0,
    });
    return {
      score: result.object.score,
      weakAspects: result.object.weakAspects ?? [],
    };
  } catch (error) {
    log.warn(
      `[Research] Coverage assessment failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return { score: 4, weakAspects: [] };
  }
}

/**
 * Execute all planned searches and collect sources.
 *
 * Web queries are run through `expandQuery` (when an `aiWorkerPool` is supplied)
 * to generate keyword variants — same coverage strategy used by the @web tool —
 * and the variants are searched in parallel and deduplicated by URL.
 */
async function executeSearches(
  plan: SearchPlan,
  aiWorkerPool?: AIWorkerPool
): Promise<{ sources: CollectedSource[]; searchSteps: ResearchResult['searchSteps'] }> {
  const sources: CollectedSource[] = [];
  const searchSteps: ResearchResult['searchSteps'] = [];
  let sourceId = 1;

  for (const query of plan.queries) {
    try {
      switch (query.tool) {
        case 'web_search': {
          let variants = [query.query];
          if (aiWorkerPool) {
            const expanded = await expandQuery(query.query, aiWorkerPool);
            if (expanded.alternatives.length > 0) {
              variants = [query.query, ...expanded.alternatives];
              log.info(`[Research] Expanded query into ${variants.length} variants`);
            }
          }

          const webResultsList = await Promise.all(
            variants.map((q) =>
              executeDirectWebSearch({
                query: q,
                searchType: 'general',
                maxResults: 5,
              }).catch((err: unknown) => {
                log.warn(
                  `[Research] Web search failed for variant "${q}": ${err instanceof Error ? err.message : String(err)}`
                );
                return null;
              })
            )
          );

          for (let i = 0; i < variants.length; i++) {
            const webResults = webResultsList[i];
            if (!webResults) continue;
            searchSteps.push({
              tool: 'web_search',
              query: variants[i],
              resultsCount: webResults.resultsCount,
            });
            for (const result of webResults.results) {
              sources.push({
                id: sourceId++,
                title: result.title,
                url: result.url,
                domain: result.domain,
                snippet: result.snippet,
                relevance: 1 - (result.rank - 1) * 0.1,
                sourceType: 'web',
              });
            }
          }
          break;
        }

        case 'gruenerator_search': {
          const docResults = await executeDirectSearch({
            query: query.query,
            collection: 'deutschland',
            limit: 5,
          });
          searchSteps.push({
            tool: 'gruenerator_search',
            query: query.query,
            resultsCount: docResults.resultsCount,
          });
          for (const result of docResults.results) {
            sources.push({
              id: sourceId++,
              title: result.source,
              url: result.url || '',
              domain: 'gruene.de',
              snippet: result.excerpt,
              relevance:
                result.relevance === 'Sehr hoch' ? 0.9 : result.relevance === 'Hoch' ? 0.7 : 0.5,
              sourceType: 'document',
            });
          }
          break;
        }
      }
    } catch (error) {
      log.error(`[Research] Search failed for ${query.tool}:`, error);
      searchSteps.push({
        tool: query.tool,
        query: query.query,
        resultsCount: 0,
      });
    }
  }

  // Sort sources by relevance and deduplicate by URL
  const uniqueSources = deduplicateByUrl(sources, (s) => s.url || undefined);
  uniqueSources.sort((a, b) => b.relevance - a.relevance);

  // Re-number sources after deduplication
  return {
    sources: uniqueSources.slice(0, 10).map((s, i) => ({ ...s, id: i + 1 })),
    searchSteps,
  };
}

/**
 * Generate follow-up questions based on the original question and sources.
 */
function generateFollowUpQuestions(question: string, _sources: CollectedSource[]): string[] {
  const followUps: string[] = [];
  const q = question.toLowerCase();

  // Person-related follow-ups
  if (/\b(wer|person|politiker)\b/i.test(q)) {
    followUps.push('Welche politischen Positionen vertritt diese Person?');
    followUps.push('Welche aktuellen Projekte oder Initiativen gibt es?');
  }

  // Policy-related follow-ups
  if (/\b(politik|position|programm|thema)\b/i.test(q)) {
    followUps.push('Wie hat sich diese Position in den letzten Jahren entwickelt?');
    followUps.push('Welche Beschlüsse gibt es zu diesem Thema?');
  }

  // Location-related follow-ups
  if (/\b(ort|stadt|region|wahlkreis)\b/i.test(q)) {
    followUps.push('Wer sind die lokalen Grünen-Vertreter*innen?');
    followUps.push('Welche lokalen Initiativen gibt es?');
  }

  // Generic follow-ups if nothing specific
  if (followUps.length === 0) {
    followUps.push('Gibt es aktuelle Entwicklungen zu diesem Thema?');
    followUps.push('Welche weiteren Informationen sind verfügbar?');
  }

  return followUps.slice(0, 3);
}

/**
 * Synthesize sources into a Perplexity-style answer with inline citations.
 * This is a template-based approach - for better results, use an LLM call.
 */
function synthesizeAnswer(
  _question: string,
  sources: CollectedSource[],
  strategy: string
): { answer: string; confidence: 'high' | 'medium' | 'low' } {
  if (sources.length === 0) {
    return {
      answer: 'Zu dieser Anfrage konnten leider keine relevanten Informationen gefunden werden.',
      confidence: 'low',
    };
  }

  // Build answer from sources with inline citations
  const paragraphs: string[] = [];
  const usedSources = new Set<number>();

  // Group sources by type
  const personSources = sources.filter((s) => s.sourceType === 'person');
  const docSources = sources.filter((s) => s.sourceType === 'document');
  const webSources = sources.filter((s) => s.sourceType === 'web');

  // Lead with most relevant information
  if (personSources.length > 0 && strategy === 'biographical_summary') {
    const mainPerson = personSources[0];
    paragraphs.push(`${mainPerson.snippet} [${mainPerson.id}]`);
    usedSources.add(mainPerson.id);

    // Add additional person context
    for (const src of personSources.slice(1, 3)) {
      if (src.snippet && src.snippet.length > 50) {
        paragraphs.push(`${truncateText(src.snippet, 200)} [${src.id}]`);
        usedSources.add(src.id);
      }
    }
  }

  // Add document sources for policy context
  if (docSources.length > 0 && (strategy === 'policy_overview' || paragraphs.length === 0)) {
    for (const src of docSources.slice(0, 2)) {
      if (src.snippet) {
        paragraphs.push(`${truncateText(src.snippet, 250)} [${src.id}]`);
        usedSources.add(src.id);
      }
    }
  }

  // Add web sources for current/supplementary info
  if (webSources.length > 0) {
    const relevantWeb = webSources.slice(0, paragraphs.length === 0 ? 3 : 2);
    for (const src of relevantWeb) {
      if (src.snippet) {
        paragraphs.push(`${truncateText(src.snippet, 200)} [${src.id}]`);
        usedSources.add(src.id);
      }
    }
  }

  // Determine confidence based on source quality and quantity
  let confidence: 'high' | 'medium' | 'low' = 'medium';
  if (usedSources.size >= 3 && sources.some((s) => s.relevance > 0.8)) {
    confidence = 'high';
  } else if (usedSources.size < 2) {
    confidence = 'low';
  }

  return {
    answer: paragraphs.join('\n\n'),
    confidence,
  };
}

/**
 * Synthesize sources into a coherent answer using Mistral-small LLM.
 * Produces higher quality prose than template-based synthesis.
 *
 * @param question - The user's research question
 * @param sources - Collected sources from various searches
 * @param strategy - Synthesis strategy (policy_overview, factual_synthesis, etc.)
 * @returns Synthesized answer with confidence level
 */
async function synthesizeAnswerWithLLM(
  question: string,
  sources: CollectedSource[],
  strategy: string,
  brief?: string | null,
  reportShape?: ReportShape
): Promise<{ answer: string; confidence: 'high' | 'medium' | 'low' }> {
  if (sources.length === 0) {
    return {
      answer: 'Zu dieser Anfrage konnten leider keine relevanten Informationen gefunden werden.',
      confidence: 'low',
    };
  }

  const aiModel = getIntermediateModel();

  // Structured-report templates: only used when a deep planner emitted a reportShape.
  // Single-shot research keeps the original short-answer behavior.
  const shapeTemplate: Record<ReportShape, string> = {
    biographical:
      'Strukturiere als mehrteiligen Bericht mit Markdown-Überschriften (##): "Werdegang", "Politische Karriere", "Positionen", "Aktuelles". Pro Abschnitt 1–3 Absätze.',
    comparative:
      'Strukturiere als Vergleich mit Markdown-Überschriften (##): "Position A", "Position B", "Unterschiede", "Gemeinsamkeiten". Pro Abschnitt 1–3 Absätze.',
    positional:
      'Strukturiere als Positionsbericht mit Markdown-Überschriften (##): "Hintergrund", "Position", "Begründung", "Kritik & Debatte". Pro Abschnitt 1–3 Absätze.',
    event:
      'Strukturiere als Ereignisbericht mit Markdown-Überschriften (##): "Was ist passiert", "Hintergrund", "Reaktionen", "Einordnung". Pro Abschnitt 1–3 Absätze.',
    general:
      'Strukturiere als ausführlichen Bericht mit Markdown-Überschriften (##) für die wichtigsten 3–5 Aspekte. Pro Abschnitt 1–3 Absätze.',
  };

  const lengthRule = reportShape
    ? `- Schreibe einen ausführlichen, gut gegliederten Bericht (${shapeTemplate[reportShape]})`
    : '- Schreibe 2-4 prägnante, gut strukturierte Absätze';

  const systemPrompt = `Du bist ein Recherche-Assistent der Grünen Partei. Synthetisiere die gegebenen Quellen zu einer kohärenten, informativen Antwort auf Deutsch.

Regeln:
- Nutze NUR Informationen aus den gegebenen Quellen
- Verwende Inline-Zitate [1], [2] etc. für jede Aussage, die sich auf eine Quelle bezieht
${lengthRule}
- Keine Erfindungen oder externes Wissen hinzufügen
- Antworte immer auf Deutsch
- Fasse die wichtigsten Informationen zusammen und stelle Zusammenhänge her
- Strategie: ${strategy === 'policy_overview' ? 'Fokussiere auf politische Positionen und Beschlüsse' : 'Fasse die faktischen Informationen objektiv zusammen'}`;

  const sourcesText = sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.domain})\n${s.snippet}`)
    .join('\n\n');

  const userContent = brief
    ? `Frage: ${question}\n\nRecherche-Auftrag (zur Orientierung beim Synthetisieren — nicht als Quelle zitieren):\n${brief}\n\nQuellen:\n${sourcesText}`
    : `Frage: ${question}\n\nQuellen:\n${sourcesText}`;

  try {
    const result = await generateText({
      model: aiModel,
      messages: [
        {
          role: 'user',
          content: userContent,
        },
      ],
      system: systemPrompt,
      temperature: 0.2,
      maxOutputTokens: reportShape ? 2400 : sources.length > 6 ? 1500 : 500,
    });

    // Determine confidence based on source quality and quantity
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (sources.length >= 3 && sources.some((s) => s.relevance > 0.8)) {
      confidence = 'high';
    } else if (sources.length < 2) {
      confidence = 'low';
    }

    return {
      answer: result.text,
      confidence,
    };
  } catch (error: unknown) {
    log.error(
      '[Research] LLM synthesis failed:',
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

/**
 * Synthesize answer with automatic fallback to template-based synthesis.
 * Uses LLM synthesis by default, falls back gracefully on errors.
 */
async function synthesizeWithFallback(
  question: string,
  sources: CollectedSource[],
  strategy: string,
  useLLM: boolean,
  brief?: string | null,
  reportShape?: ReportShape
): Promise<{ answer: string; confidence: 'high' | 'medium' | 'low' }> {
  if (!useLLM) {
    return synthesizeAnswer(question, sources, strategy);
  }

  try {
    return await synthesizeAnswerWithLLM(question, sources, strategy, brief, reportShape);
  } catch (error: unknown) {
    log.warn('[Research] LLM synthesis failed, falling back to template', {
      error: error instanceof Error ? error.message : String(error),
    });
    return synthesizeAnswer(question, sources, strategy);
  }
}

/**
 * Execute a structured research workflow with planning, searching, and synthesis.
 * This is the main entry point for the research tool.
 *
 * @param params.question - Search-friendly query (short, keyword-focused). Used for
 *   the planner heuristics and the search engines.
 * @param params.brief - Optional natural-language research plan to forward to the
 *   LLM synthesis stage as additional orientation. Must NOT be used as a search
 *   query — keyword indexes don't match prose directives.
 * @param params.aiWorkerPool - Required to run query expansion on web searches.
 * @param params.depth - Search depth: 'quick' (default) or 'thorough'
 * @param params.maxSources - Maximum number of sources to include (default: 8)
 * @param params.useLLMSynthesis - Use Mistral-small for coherent synthesis (default: true)
 */
export async function executeResearch(params: {
  question: string;
  brief?: string | null;
  aiWorkerPool?: AIWorkerPool;
  depth?: 'quick' | 'thorough';
  maxSources?: number;
  useLLMSynthesis?: boolean;
  complexity?: 'simple' | 'moderate' | 'complex';
  userLocale?: string;
  onProgress?: (message: string) => void;
}): Promise<ResearchResult> {
  const {
    question,
    brief,
    aiWorkerPool,
    depth = 'quick',
    maxSources = 8,
    useLLMSynthesis = true,
    complexity = 'moderate',
    userLocale,
    onProgress,
  } = params;

  // Defense in depth: refuse empty question. Without this, the deep planner
  // hallucinates topics from context bias (locale, brief). The proper fix is
  // upstream (chatGraphContractRouter populates searchQuery from the user's
  // message when @-mentions force a search intent), but this guard catches
  // any future caller that forgets to pass a question.
  if (!question || !question.trim()) {
    log.warn('[Research] Refusing to run with empty question');
    return {
      answer:
        'Bitte stelle eine konkrete Recherche-Frage. Beispiel: "Recherchiere Friedrich Merz" oder "@recherche aktuelle Klimapolitik".',
      citations: [],
      followUpQuestions: [],
      searchSteps: [],
      confidence: 'low',
    };
  }

  log.info(
    `[Research] Starting research for: "${truncateText(question, 100)}" (depth: ${depth}, complexity: ${complexity})`
  );

  const defaultLocale: ResearchLocale =
    userLocale === 'de-AT' ? 'at' : userLocale === 'de-EU' ? 'eu' : 'de';

  // Deep path: explicit @recherche always gets LLM-driven planning, parallel
  // sub-question search, an optional refinement round, and a structured report.
  // The complexity heuristic is unreliable for short biographical questions
  // ("wer ist X" is 22 chars → 'simple' but is exactly when deep mode helps),
  // so we don't gate on it. Bounded to ~17s by the 1-round refinement cap.
  // Opt-out is `useLLMSynthesis: false` for callers that explicitly want fast.
  if (useLLMSynthesis) {
    onProgress?.('Plane Recherche…');
    const deepPlan = await planResearchDeep(question, defaultLocale, brief);
    if (deepPlan) {
      return executeDeepResearch({
        question,
        ...(brief !== undefined ? { brief } : {}),
        plan: deepPlan,
        maxSources: Math.max(maxSources, 12),
        ...(aiWorkerPool ? { aiWorkerPool } : {}),
        ...(onProgress ? { onProgress } : {}),
      });
    }
    log.info('[Research] Deep planner returned null — falling back to single-shot path');
  }

  // Phase 1: Plan the research
  const plan = planResearch(question);

  // Limit queries based on depth
  const maxQueries = depth === 'thorough' ? 5 : 3;
  plan.queries = plan.queries.slice(0, maxQueries);

  // For thorough mode, ensure both web and document search are included per topic
  if (depth === 'thorough') {
    const hasWeb = plan.queries.some((q) => q.tool === 'web_search');
    const hasDoc = plan.queries.some((q) => q.tool === 'gruenerator_search');
    if (!hasWeb) {
      plan.queries.push({
        tool: 'web_search',
        query: question,
        priority: 3,
        reason: 'Thorough: supplementary web search',
      });
    }
    if (!hasDoc) {
      plan.queries.push({
        tool: 'gruenerator_search',
        query: question,
        priority: 3,
        reason: 'Thorough: supplementary document search',
      });
    }
    plan.queries = plan.queries.slice(0, maxQueries);
  }

  log.info(
    `[Research] Plan: ${plan.queries.length} queries (depth: ${depth}), strategy: ${plan.synthesisStrategy}`
  );

  // Phase 2: Execute searches
  const { sources, searchSteps } = await executeSearches(plan, aiWorkerPool);
  log.info(`[Research] Collected ${sources.length} sources from ${searchSteps.length} searches`);

  // B3: Apply MMR diversity to sources before synthesis
  const diverseSources =
    sources.length > 3
      ? (applyMMR(
          sources.map((s) => ({ ...s, relevance: s.relevance, content: s.snippet })),
          0.7,
          2
        ).map((s, i) => ({ ...s, id: i + 1 })) as CollectedSource[])
      : sources;

  // Phase 3: Synthesize answer
  const limitedSources = diverseSources.slice(0, maxSources);
  log.info(`[Research] Synthesizing with ${useLLMSynthesis ? 'LLM (mistral-small)' : 'template'}`);
  let { answer, confidence } = await synthesizeWithFallback(
    question,
    limitedSources,
    plan.synthesisStrategy,
    useLLMSynthesis,
    brief
  );

  // B4: Validate citation grounding
  if (useLLMSynthesis && answer) {
    const groundingResult = validateCitations(
      answer,
      limitedSources.map((s) => ({ id: s.id, content: s.snippet }))
    );

    if (groundingResult.ungroundedCitations.length > 0) {
      log.warn(
        `[Research] ${groundingResult.ungroundedCitations.length} ungrounded citations removed: [${groundingResult.ungroundedCitations.join(', ')}]`
      );
      answer = stripUngroundedCitations(answer, groundingResult.ungroundedCitations);

      // If >50% ungrounded, fall back to template synthesis
      if (groundingResult.confidence < 0.5 && groundingResult.totalCitations > 2) {
        log.warn('[Research] >50% citations ungrounded, falling back to template synthesis');
        const fallback = synthesizeAnswer(question, limitedSources, plan.synthesisStrategy);
        answer = fallback.answer;
        confidence = fallback.confidence;
      }
    }
  }

  // Generate follow-up questions
  const followUpQuestions = generateFollowUpQuestions(question, limitedSources);

  // Build citations list
  const citations: ResearchCitation[] = limitedSources.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    domain: s.domain,
    snippet: truncateText(s.snippet, 150),
  }));

  log.info(`[Research] Complete: ${citations.length} citations, confidence: ${confidence}`);

  return {
    answer,
    citations,
    followUpQuestions,
    searchSteps,
    confidence,
  };
}

/**
 * Deep research: LLM planner → parallel sub-question search → optional refinement
 * round (when coverage is weak) → structured synthesis with reportShape template.
 *
 * Latency budget: ~17s (plan ~2s + round 1 ~5s + assess ~2s + optional round 2 ~5s + synth ~3s).
 * Hard cap: 1 refinement round.
 */
async function executeDeepResearch(args: {
  question: string;
  brief?: string | null;
  plan: DeepPlan;
  maxSources: number;
  aiWorkerPool?: AIWorkerPool;
  onProgress?: (message: string) => void;
}): Promise<ResearchResult> {
  const { question, brief, plan, maxSources, aiWorkerPool, onProgress } = args;
  log.info(
    `[Research/Deep] ${plan.subQuestions.length} sub-questions, locale=${plan.locale}, shape=${plan.reportShape}`
  );

  // Round 1: parallel fan-out across all sub-questions.
  onProgress?.(`Suche zu ${plan.subQuestions.length} Sub-Fragen…`);
  const round1 = await executeDeepSearches(plan, aiWorkerPool, 1);
  log.info(
    `[Research/Deep] Round 1: ${round1.sources.length} sources from ${round1.searchSteps.length} searches`
  );

  let allSources = round1.sources;
  const allSearchSteps = round1.searchSteps;

  // Round 2: only if coverage is weak. Hard cap at 1 refinement round.
  if (round1.sources.length >= 2) {
    const coverage = await assessCoverage(question, round1.sources);
    log.info(
      `[Research/Deep] Coverage: ${coverage.score}/5${coverage.weakAspects.length ? ` (weak: ${coverage.weakAspects.join(', ')})` : ''}`
    );

    if (coverage.score < 4 && coverage.weakAspects.length > 0) {
      onProgress?.(`Vertiefe Recherche zu: ${coverage.weakAspects[0]}…`);
      // Refinement queries MUST carry entity context. The assessor returns
      // terse phrases like "Herkunft", "politische Karriere" (per its prompt
      // "kurze Suchphrasen (nicht ganze Fragen)"). Used as-is, search engines
      // get no signal about WHO/WHAT — Mona Neubauer's "Herkunft" search
      // returned random Bachelorarbeiten and montessori articles. Prefix the
      // original question so the entity name carries through.
      const refinementPlan: DeepPlan = {
        subQuestions: coverage.weakAspects.slice(0, 3).map((aspect, i) => ({
          id: `r2-${i}`,
          question: `${question} ${aspect}`,
          sources: ['web', 'qdrant'],
        })),
        locale: plan.locale,
        reportShape: plan.reportShape,
      };
      const round2 = await executeDeepSearches(
        refinementPlan,
        aiWorkerPool,
        round1.sources.length + 1
      );
      log.info(
        `[Research/Deep] Round 2: +${round2.sources.length} sources from ${round2.searchSteps.length} searches`
      );

      // Dedupe round 2 against round 1 by URL, then concat
      const seenUrls = new Set(round1.sources.map((s) => s.url).filter(Boolean));
      const newSources = round2.sources.filter((s) => !s.url || !seenUrls.has(s.url));
      allSources = [...round1.sources, ...newSources];
      allSearchSteps.push(...round2.searchSteps);
    }
  }

  // MMR for diversity, then cap. Re-number contiguously after.
  const diverse =
    allSources.length > 3
      ? (applyMMR(
          allSources.map((s) => ({ ...s, content: s.snippet })),
          0.7,
          2
        ) as CollectedSource[])
      : allSources;
  const limitedSources = diverse.slice(0, maxSources).map((s, i) => ({ ...s, id: i + 1 }));

  log.info(
    `[Research/Deep] Synthesizing ${limitedSources.length} sources as ${plan.reportShape} report`
  );
  onProgress?.('Erstelle Bericht…');

  const strategy =
    plan.reportShape === 'positional' || plan.reportShape === 'comparative'
      ? 'policy_overview'
      : 'factual_synthesis';
  let { answer, confidence } = await synthesizeWithFallback(
    question,
    limitedSources,
    strategy,
    true,
    brief,
    plan.reportShape
  );

  // Citation grounding (same as single-shot path).
  if (answer) {
    const groundingResult = validateCitations(
      answer,
      limitedSources.map((s) => ({ id: s.id, content: s.snippet }))
    );
    if (groundingResult.ungroundedCitations.length > 0) {
      log.warn(
        `[Research/Deep] ${groundingResult.ungroundedCitations.length} ungrounded citations removed`
      );
      answer = stripUngroundedCitations(answer, groundingResult.ungroundedCitations);
      if (groundingResult.confidence < 0.5 && groundingResult.totalCitations > 2) {
        log.warn('[Research/Deep] >50% citations ungrounded, falling back to template');
        const fallback = synthesizeAnswer(question, limitedSources, strategy);
        answer = fallback.answer;
        confidence = fallback.confidence;
      }
    }
  }

  const followUpQuestions = generateFollowUpQuestions(question, limitedSources);
  const citations: ResearchCitation[] = limitedSources.map((s) => ({
    id: s.id,
    title: s.title,
    url: s.url,
    domain: s.domain,
    snippet: truncateText(s.snippet, 150),
  }));

  log.info(`[Research/Deep] Complete: ${citations.length} citations, confidence: ${confidence}`);

  return {
    answer,
    citations,
    followUpQuestions,
    searchSteps: allSearchSteps,
    confidence,
  };
}

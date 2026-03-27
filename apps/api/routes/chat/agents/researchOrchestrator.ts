/**
 * Research Orchestrator
 *
 * Perplexity-style structured research pipeline: plan searches, execute them
 * in parallel, deduplicate and diversify sources, then synthesize a coherent
 * answer with inline citations and follow-up questions.
 */

import { generateText } from 'ai';

import {
  validateCitations,
  stripUngroundedCitations,
} from '../../../services/search/CitationGrounder.js';
import { applyMMR } from '../../../services/search/DiversityReranker.js';
import { createLogger } from '../../../utils/logger.js';

import { executeDirectSearch, executeDirectWebSearch } from './directSearchExecutors.js';
import { getModel } from './providers.js';
import { truncateText, deduplicateByUrl } from './searchFormatting.js';

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
 * Execute all planned searches and collect sources.
 */
async function executeSearches(
  plan: SearchPlan
): Promise<{ sources: CollectedSource[]; searchSteps: ResearchResult['searchSteps'] }> {
  const sources: CollectedSource[] = [];
  const searchSteps: ResearchResult['searchSteps'] = [];
  let sourceId = 1;

  for (const query of plan.queries) {
    try {
      switch (query.tool) {
        case 'web_search': {
          const webResults = await executeDirectWebSearch({
            query: query.query,
            searchType: 'general',
            maxResults: 5,
          });
          searchSteps.push({
            tool: 'web_search',
            query: query.query,
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
  strategy: string
): Promise<{ answer: string; confidence: 'high' | 'medium' | 'low' }> {
  if (sources.length === 0) {
    return {
      answer: 'Zu dieser Anfrage konnten leider keine relevanten Informationen gefunden werden.',
      confidence: 'low',
    };
  }

  const aiModel = getModel('mistral', 'mistral-small-latest');

  const systemPrompt = `Du bist ein Recherche-Assistent der Grünen Partei. Synthetisiere die gegebenen Quellen zu einer kohärenten, informativen Antwort auf Deutsch.

Regeln:
- Nutze NUR Informationen aus den gegebenen Quellen
- Verwende Inline-Zitate [1], [2] etc. für jede Aussage, die sich auf eine Quelle bezieht
- Schreibe 2-4 prägnante, gut strukturierte Absätze
- Keine Erfindungen oder externes Wissen hinzufügen
- Antworte immer auf Deutsch
- Fasse die wichtigsten Informationen zusammen und stelle Zusammenhänge her
- Strategie: ${strategy === 'policy_overview' ? 'Fokussiere auf politische Positionen und Beschlüsse' : 'Fasse die faktischen Informationen objektiv zusammen'}`;

  const sourcesText = sources
    .map((s, i) => `[${i + 1}] ${s.title} (${s.domain})\n${s.snippet}`)
    .join('\n\n');

  try {
    const result = await generateText({
      model: aiModel,
      messages: [
        {
          role: 'user',
          content: `Frage: ${question}\n\nQuellen:\n${sourcesText}`,
        },
      ],
      system: systemPrompt,
      temperature: 0.2,
      maxOutputTokens: sources.length > 6 ? 1500 : 500,
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
  } catch (error: any) {
    log.error('[Research] LLM synthesis failed:', error.message);
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
  useLLM: boolean
): Promise<{ answer: string; confidence: 'high' | 'medium' | 'low' }> {
  if (!useLLM) {
    return synthesizeAnswer(question, sources, strategy);
  }

  try {
    return await synthesizeAnswerWithLLM(question, sources, strategy);
  } catch (error: any) {
    log.warn('[Research] LLM synthesis failed, falling back to template', {
      error: error.message,
    });
    return synthesizeAnswer(question, sources, strategy);
  }
}

/**
 * Execute a structured research workflow with planning, searching, and synthesis.
 * This is the main entry point for the research tool.
 *
 * @param params.question - The research question to answer
 * @param params.depth - Search depth: 'quick' (default) or 'thorough'
 * @param params.maxSources - Maximum number of sources to include (default: 8)
 * @param params.useLLMSynthesis - Use Mistral-small for coherent synthesis (default: true)
 */
export async function executeResearch(params: {
  question: string;
  depth?: 'quick' | 'thorough';
  maxSources?: number;
  useLLMSynthesis?: boolean;
}): Promise<ResearchResult> {
  const { question, depth = 'quick', maxSources = 8, useLLMSynthesis = true } = params;

  log.info(`[Research] Starting research for: "${truncateText(question, 100)}" (depth: ${depth})`);

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
  const { sources, searchSteps } = await executeSearches(plan);
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
    useLLMSynthesis
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

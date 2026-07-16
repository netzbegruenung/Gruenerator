/**
 * Classifier Response Parsing
 *
 * Parses LLM JSON responses with 3 fallback strategies,
 * plus heuristic complexity and search-source detection.
 */

import { createLogger } from '../../../../utils/logger.js';

import { extractFilters } from './classifierFilters.js';
import { extractSearchTopic } from './classifierHeuristics.js';
import { NON_SEARCH_INTENTS } from './classifierPrompt.js';

import type { SearchIntent, SearchSource, ClassificationResult } from '../types.js';
import type { ClassifierLLMResponse } from './classifierFilters.js';

const log = createLogger('ChatGraph:Classifier');

/**
 * Phrases that reference the user's earlier work — a past conversation with the
 * assistant OR one of the user's own office documents (docs/presentations/
 * sheets). Used both to add the `chat_history` search source (combined queries)
 * and to defensively upgrade a misclassified `direct` intent to the
 * `chat_history` tool.
 */
export const CHAT_HISTORY_KEYWORDS =
  /\b(letzte[sn]?\s+gespräch|vorher\s+besprochen|letzte\s+woche|gestern\s+besprochen|was\s+haben\s+wir|erinnere?\s+dich|wir\s+hatten|früheres?\s+chat|voriges?\s+gespräch|damals\s+besprochen|da\s+weiter|wo\s+wir\s+aufgehört|mein(e|en)?\s+(dokument|präsentation|tabelle|notiz|antrag|board|kanban|tafel)|meine\s+(dokumente|präsentationen|tabellen|notizen|boards)|die\s+tabelle\s+die\s+ich|das\s+dokument\s+das\s+ich|das\s+board\s+das\s+ich)\b/i;

/**
 * Parse JSON response from classifier, with error handling.
 * Handles extended response format with typoAnalysis and contentType.
 */
export function parseClassifierResponse(
  content: string,
  userContent: string
): ClassificationResult {
  // Valid intents (person removed - feature disabled)
  const validIntents = [
    'research',
    'compare',
    'search',
    'web',
    'examples',
    'social_post',
    'abgeordnetenwatch',
    'bundestag',
    'bahn',
    'reise',
    'wetter',
    'news',
    'sharepic',
    'image',
    'image_edit',
    'summary',
    'chart',
    'artifact',
    'compute',
    'save_as_doc',
    'modify_doc',
    'modify_board',
    'chat_history',
    'direct',
  ];

  /**
   * Process parsed response and build classification result.
   * Uses optimizedSearchQuery when available for better retrieval precision.
   */
  function processResponse(
    parsed: ClassifierLLMResponse,
    extracted = false
  ): ClassificationResult | null {
    // Log typo detection for debugging
    if (parsed.typoAnalysis) {
      log.debug(
        `[Classifier] Typo detected: "${parsed.typoAnalysis.original}" → "${parsed.typoAnalysis.corrected}"`
      );
    }

    // Log content-type analysis
    if (parsed.contentType) {
      log.debug(
        `[Classifier] Content type: ${parsed.contentType}, needsResearch: ${parsed.needsResearch}`
      );
    }

    // Defensive upgrade: the LLM sometimes calls a clear past-conversation
    // reference "direct". If the text plainly points at an earlier chat, route
    // it to the chat_history tool instead.
    if (parsed.intent === 'direct' && CHAT_HISTORY_KEYWORDS.test(userContent)) {
      log.info('[Classifier] Upgraded direct → chat_history (past-conversation reference)');
      parsed.intent = 'chat_history';
    }

    // If LLM returns 'person', route to web instead
    if (parsed.intent === 'person') {
      return {
        intent: 'web',
        searchQuery: parsed.optimizedSearchQuery || parsed.searchQuery || userContent,
        reasoning: 'Person intent rerouted to web (feature disabled)',
      };
    }

    if (parsed.intent && validIntents.includes(parsed.intent)) {
      const suffix = extracted ? ' (extracted)' : '';
      const isSearchIntent = !NON_SEARCH_INTENTS.has(parsed.intent);

      // Prefer optimizedSearchQuery for search intents
      let effectiveSearchQuery = isSearchIntent
        ? parsed.optimizedSearchQuery || parsed.searchQuery || userContent
        : null;

      // Defense-in-depth: detect if typoAnalysis corrupted the search query
      // If >40% of original significant words were lost, the LLM likely hallucinated
      // a "correction" for proper nouns it didn't recognize
      if (effectiveSearchQuery && parsed.typoAnalysis && isSearchIntent) {
        const originalWords = userContent
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        const queryWords = effectiveSearchQuery
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
        const preserved = originalWords.filter((w) =>
          queryWords.some((qw) => qw.includes(w) || w.includes(qw))
        );
        const preservedRatio =
          originalWords.length > 0 ? preserved.length / originalWords.length : 1;

        if (preservedRatio < 0.6) {
          const fallback = extractSearchTopic(userContent);
          log.warn(
            `[Classifier] Typo correction may have corrupted query: "${effectiveSearchQuery}" ` +
              `(only ${Math.round(preservedRatio * 100)}% words preserved). ` +
              `Falling back to: "${fallback}"`
          );
          effectiveSearchQuery = fallback;
        }
      }

      if (parsed.optimizedSearchQuery && isSearchIntent) {
        log.debug(
          `[Classifier] Query optimized: "${parsed.searchQuery}" → "${parsed.optimizedSearchQuery}"`
        );
      }

      // Extract sub-queries for multi-topic questions
      const subQueries =
        isSearchIntent && parsed.subQueries?.length ? parsed.subQueries.slice(0, 3) : null;

      if (subQueries) {
        log.debug(
          `[Classifier] Decomposed into ${subQueries.length} sub-queries: ${subQueries.join(' | ')}`
        );
      }

      // Extract search sources for parallel multi-source search
      const validSources = ['documents', 'web'];
      const searchSources =
        parsed.searchSources?.filter((s): s is SearchSource => validSources.includes(s)) || [];

      if (searchSources.length > 1) {
        log.debug(`[Classifier] Multi-source search: ${searchSources.join(' + ')}`);
      }

      // Extract metadata filters
      const filters = extractFilters(parsed.filters);
      if (filters) {
        log.debug(`[Classifier] Detected filters: ${JSON.stringify(filters)}`);
      }

      // Validate secondaryIntent: must differ from intent, cannot be a context-providing intent
      const contextIntents = new Set(['search', 'research', 'web']);
      const validSecondary =
        parsed.secondaryIntent &&
        parsed.secondaryIntent !== parsed.intent &&
        !contextIntents.has(parsed.secondaryIntent)
          ? (parsed.secondaryIntent as SearchIntent)
          : null;

      if (validSecondary) {
        log.info(`[Classifier] Secondary intent detected: ${validSecondary}`);
      }

      const result: ClassificationResult = {
        intent: parsed.intent as SearchIntent,
        secondaryIntent: validSecondary,
        searchQuery: effectiveSearchQuery,
        subQueries,
        searchSources,
        filters,
        reasoning: (parsed.reasoning || 'LLM classification') + suffix,
        contentType: parsed.contentType || null,
        documentSubtype: parsed.documentSubtype || null,
        targetGroupName: parsed.targetGroupName || null,
      };

      if (parsed.needsClarification && parsed.clarificationQuestion) {
        result.needsClarification = true;
        result.clarificationQuestion = parsed.clarificationQuestion;
        result.clarificationOptions = parsed.clarificationOptions?.slice(0, 4) || undefined;
        log.info(`[Classifier] Clarification needed: "${parsed.clarificationQuestion}"`);
      }

      return result;
    }

    return null;
  }

  try {
    // Try direct JSON parse
    const parsed = JSON.parse(content) as ClassifierLLMResponse;
    const result = processResponse(parsed);
    if (result) return result;
  } catch {
    // Try to extract JSON from text - handle nested objects with non-greedy match
    const jsonMatch = content.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]) as ClassifierLLMResponse;
        const result = processResponse(parsed, true);
        if (result) return result;
      } catch {
        // Try more permissive JSON extraction for nested objects
        const deepJsonMatch = content.match(/\{[\s\S]*\}/);
        if (deepJsonMatch) {
          try {
            const parsed = JSON.parse(deepJsonMatch[0]) as ClassifierLLMResponse;
            const result = processResponse(parsed, true);
            if (result) return result;
          } catch {
            // Fall through to heuristic
          }
        }
      }
    }
  }

  // Fallback: detect intent from LLM text using intent-field patterns.
  // Only match when the LLM actually tried to output the intent value,
  // not when it mentions a word in reasoning (e.g. "no research needed").
  // Order: cheapest/most-specific first, most-expensive last.
  const intentFieldPattern = (intent: string) =>
    new RegExp(`["']?intent["']?\\s*[:=]\\s*["']?${intent}\\b`, 'i');

  // sharepic before image: it's the more specific intent and must not be shadowed.
  if (intentFieldPattern('sharepic').test(content))
    return {
      intent: 'sharepic',
      searchQuery: null,
      reasoning: 'Fallback: sharepic detected in response',
    };
  if (intentFieldPattern('image').test(content))
    return {
      intent: 'image',
      searchQuery: null,
      reasoning: 'Fallback: image detected in response',
    };
  if (intentFieldPattern('save_as_doc').test(content))
    return {
      intent: 'save_as_doc',
      searchQuery: null,
      reasoning: 'Fallback: save_as_doc detected in response',
    };
  if (intentFieldPattern('share_doc').test(content))
    return {
      intent: 'share_doc',
      searchQuery: null,
      reasoning: 'Fallback: share_doc detected in response',
    };
  if (intentFieldPattern('chart').test(content))
    return {
      intent: 'chart',
      searchQuery: userContent,
      reasoning: 'Fallback: chart detected in response',
    };
  if (intentFieldPattern('summary').test(content))
    return {
      intent: 'summary',
      searchQuery: null,
      reasoning: 'Fallback: summary detected in response',
    };
  // System MCP intents — specific tokens, safe before the broad direct/search.
  if (intentFieldPattern('reise').test(content))
    return {
      intent: 'reise',
      searchQuery: null,
      reasoning: 'Fallback: reise detected in response',
    };
  if (intentFieldPattern('bahn').test(content))
    return {
      intent: 'bahn',
      searchQuery: null,
      reasoning: 'Fallback: bahn detected in response',
    };
  if (intentFieldPattern('wetter').test(content))
    return {
      intent: 'wetter',
      searchQuery: null,
      reasoning: 'Fallback: wetter detected in response',
    };
  if (intentFieldPattern('news').test(content))
    return {
      intent: 'news',
      searchQuery: userContent,
      reasoning: 'Fallback: news detected in response',
    };
  if (intentFieldPattern('direct').test(content))
    return {
      intent: 'direct',
      searchQuery: null,
      reasoning: 'Fallback: direct detected in response',
    };
  // social_post before examples: 'examples' would otherwise never lose to it
  // in malformed responses that mention both.
  if (intentFieldPattern('social_post').test(content))
    return {
      intent: 'social_post',
      searchQuery: userContent,
      reasoning: 'Fallback: social_post detected in response',
    };
  if (intentFieldPattern('examples').test(content))
    return {
      intent: 'examples',
      searchQuery: userContent,
      reasoning: 'Fallback: examples detected in response',
    };
  if (intentFieldPattern('search').test(content))
    return {
      intent: 'search',
      searchQuery: userContent,
      reasoning: 'Fallback: search detected in response',
    };
  if (intentFieldPattern('web').test(content))
    return {
      intent: 'web',
      searchQuery: userContent,
      reasoning: 'Fallback: web detected in response',
    };
  if (intentFieldPattern('research').test(content))
    return {
      intent: 'research',
      searchQuery: userContent,
      reasoning: 'Fallback: research detected in response',
    };

  // Final fallback: default to direct (cheapest path).
  // The heuristic already ran in classifierNode — re-running it here
  // reintroduces the same false positives (e.g. party keywords → search).
  return {
    intent: 'direct',
    searchQuery: null,
    reasoning: 'Fallback: no intent detected, defaulting to direct',
  };
}

/**
 * Detect query complexity using heuristic patterns.
 * Determines whether a query needs simple, moderate, or complex research depth.
 */
export function detectComplexity(query: string): 'simple' | 'moderate' | 'complex' {
  const q = query.toLowerCase();

  // Complex: comparison, multi-topic, or explicit detail requests
  if (
    /\b(vergleich|unterschied|pro\s+und\s+contra|gegenüber|im\s+vergleich|versus|vs\.?)\b/i.test(q)
  ) {
    return 'complex';
  }
  if (/\b(detailliert|ausführlich|umfassend|gründlich|tiefgehend|vollständig)\b/i.test(q)) {
    return 'complex';
  }
  // Multi-clause: "und" connecting distinct topics (not just filler)
  if (/\b(einerseits|andererseits|sowohl|als\s+auch)\b/i.test(q)) {
    return 'complex';
  }

  // Simple: greetings, short questions, single-entity lookups
  if (q.length < 30) {
    return 'simple';
  }
  if (/^(hallo|hi|hey|guten|servus|moin|danke)/i.test(q.trim())) {
    return 'simple';
  }
  if (/^(was ist|wer ist|wo ist|wann)\b/i.test(q.trim())) {
    return 'simple';
  }

  return 'moderate';
}

/**
 * Detect whether a query needs multiple search sources (documents + web).
 * Returns an array of search sources to query in parallel.
 * Empty array means single-source mode (backward compatible, uses intent-based routing).
 */
export function detectSearchSources(query: string, intent: SearchIntent): SearchSource[] {
  // Only applies to search-type intents
  if (!['search', 'web', 'research'].includes(intent)) {
    return [];
  }

  const q = query.toLowerCase();

  const partyKeywords =
    /\b(grüne|grünen|partei|programm|position|wahlprogramm|beschluss|grundsatzprogramm|fraktion|bundestagsfraktion|antrag)\b/i;
  const temporalKeywords =
    /\b(aktuell|aktuelle|aktuellen|entwicklung|entwicklungen|nachrichten|news|heute|kürzlich|neueste|neuste|jüngste|letzte|momentan|derzeit|gegenwärtig)\b/i;
  const comparativePattern =
    /\b(und\s+(was|wie|welche)\s+(sind|ist|gibt|waren)|und\s+(aktuelle|die\s+aktuellen?)|sowie\s+(aktuelle|die))\b/i;

  const hasPartyKeywords = partyKeywords.test(q);
  const hasTemporalKeywords = temporalKeywords.test(q);
  const hasComparative = comparativePattern.test(q);

  // Party content + temporal/current context → both sources
  if (hasPartyKeywords && (hasTemporalKeywords || hasComparative)) {
    return ['documents', 'web'];
  }

  // Party content + examples request → documents + examples
  const examplesKeywords = /\b(beispiel|vorlage|post|tweet|instagram|social\s*media)\b/i;
  if (hasPartyKeywords && examplesKeywords.test(q)) {
    return ['documents', 'examples'];
  }

  // References to past conversations → include chat_history source
  if (CHAT_HISTORY_KEYWORDS.test(q)) {
    const base: SearchSource[] = hasPartyKeywords
      ? ['documents', 'chat_history']
      : ['chat_history'];
    return base;
  }

  return [];
}

/**
 * Classifier Heuristics
 *
 * Pattern-matching "fast path" for intent classification.
 * High-confidence patterns skip the LLM call entirely.
 */

import { findBestMatch } from '@gruenerator/shared/utils';

import { createLogger } from '../../../../utils/logger.js';

import { CLASSIFIER_CONTEXT_MESSAGES, CLASSIFIER_CONTEXT_MAX_CHARS } from './classifierPrompt.js';

import type { SearchIntent, ClassificationResult } from '../types.js';
import type { ModelMessage } from 'ai';

const log = createLogger('ChatGraph:Classifier');

/**
 * Keywords for fuzzy matching in heuristic fallback.
 * Maps intents to their trigger keywords.
 */
export const INTENT_KEYWORDS: Record<
  Exclude<
    SearchIntent,
    'direct' | 'image_edit' | 'sharepic' | 'save_as_doc' | 'modify_doc' | 'modify_board' | 'share_doc'
  >,
  string[]
> = {
  research: ['recherchiere', 'recherche', 'untersuche', 'analysiere', 'erforsche'],
  image: ['visualisiere', 'zeichne', 'illustriere', 'grafik', 'illustration'],
  web: ['internet', 'netz', 'online', 'aktuell', 'nachricht', 'news'],
  search: ['grüne', 'partei', 'programm', 'position', 'wahlprogramm', 'beschluss'],
  examples: ['beispiel', 'vorlage', 'tweet', 'instagram', 'social'],
  summary: ['zusammenfassung', 'zusammenfassen', 'kurzfassung', 'überblick'],
  chart: ['diagramm', 'balkendiagramm', 'kreisdiagramm', 'liniendiagramm', 'chart', 'statistik'],
};

/**
 * Find intent using fuzzy (Levenshtein-based) matching.
 * Returns the intent if a word matches a keyword with similarity >= threshold.
 */
export function fuzzyMatchIntent(word: string, threshold = 0.75): SearchIntent | null {
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const match = findBestMatch(word, keywords, threshold);
    if (match) {
      log.debug(
        `[Fuzzy] Matched "${word}" to "${match.match}" (${intent}) with score ${match.score.toFixed(2)}`
      );
      return intent as SearchIntent;
    }
  }
  return null;
}

/**
 * Strip German task instruction prefixes from a query to extract just the topic.
 * E.g. "Schreib eine Pressemitteilung über die Klimapolitik" → "Klimapolitik"
 */
export function extractSearchTopic(query: string): string {
  // Strip leading task verbs + article/filler words + content type nouns + prepositions
  // Note: preposition alternatives are ordered longest-first to prevent partial matches
  const stripped = query
    .replace(
      /^(schreib|erstell|formulier|verfass|generier|mach|bereite|entwirf|erstelle|schreibe|formuliere|verfasse)[etn]*\s*(mir\s+)?(bitte\s+)?(eine?[nrms]?\s+)?(kurze[nrms]?\s+|lange[nrms]?\s+|ausführliche[nrms]?\s+)?(pressemitteilung|pressemeldung|pm|artikel|beitrag|blogpost|rede|ansprache|statement|argumentation|argumente|faktencheck|analyse|bericht|report|text|entwurf|zusammenfassung|post|tweet)\s*(über das thema|zu dem thema|zum thema|bezüglich|betreffend|über|zum|zur|zu)?\s*/i,
      ''
    )
    .trim();

  // If we stripped meaningful content and have a result, use it
  if (stripped.length > 3 && stripped.length < query.length * 0.9) {
    return stripped;
  }

  return query;
}

/**
 * Extract text content from a message, handling both string and AI SDK v6 parts format.
 */
export function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && typeof p === 'object' && p.type === 'text')
      .map((p) => (p as { text: string }).text)
      .join('');
  }
  return String(content || '');
}

/**
 * Format prior conversation messages as context for the classifier LLM.
 * Returns null for single-message conversations (no context needed).
 * Caps to last 5 messages at 500 chars each to keep classifier prompt lean.
 */
export function formatConversationHistory(messages: ModelMessage[]): string | null {
  if (messages.length <= 1) return null;

  const priorMessages = messages.slice(0, -1).slice(-CLASSIFIER_CONTEXT_MESSAGES);

  const formatted = priorMessages
    .map((m) => {
      const role = m.role === 'user' ? 'Nutzer' : 'Assistent';
      let text = extractMessageText(m.content);
      if (text.length > CLASSIFIER_CONTEXT_MAX_CHARS) {
        text = text.slice(0, CLASSIFIER_CONTEXT_MAX_CHARS) + '…';
      }
      return `${role}: ${text}`;
    })
    .join('\n\n');

  return `GESPRÄCHSVERLAUF:\n${formatted}`;
}

/**
 * Detect whether a query likely contains multiple distinct topics that need decomposition.
 * Returns true when both sides of a conjunction have substantial content (≥2 words each),
 * which indicates the LLM should handle sub-query splitting instead of the heuristic path.
 */
export function looksMultiTopic(query: string): boolean {
  if (query.length < 40) return false;

  const q = query.toLowerCase();

  // Split on conjunctions: "und", "sowie", "als auch"
  const conjunctions = /\b(?:und|sowie|als\s+auch)\b/;
  const match = q.match(conjunctions);
  if (!match || match.index === undefined) return false;

  const left = q.slice(0, match.index).trim();
  const right = q.slice(match.index + match[0].length).trim();

  // Each side must have ≥2 substantial words (length ≥ 2 chars)
  const leftWords = left.split(/\s+/).filter((w) => w.length >= 2);
  const rightWords = right.split(/\s+/).filter((w) => w.length >= 2);

  return leftWords.length >= 2 && rightWords.length >= 2;
}

/**
 * Heuristic result with confidence score.
 * Used to decide whether to skip LLM classification.
 */
export interface HeuristicResult extends ClassificationResult {
  confidence: number; // 0-1, higher = more certain
}

/**
 * Confidence threshold for skipping LLM.
 * Above this value, we trust heuristics and save an LLM call.
 */
export const HEURISTIC_CONFIDENCE_THRESHOLD = 0.85;

const CONTENT_TYPE_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /\b(pressemitteilung|pressemeldung|pm)\b/i, type: 'pressemitteilung' },
  { pattern: /\b(artikel|beitrag|blogpost)\b/i, type: 'artikel' },
  { pattern: /\b(rede|ansprache|statement)\b/i, type: 'rede' },
  { pattern: /\b(argumentation|argumente)\b/i, type: 'argumentation' },
  { pattern: /\b(tweet|post)\b/i, type: 'tweet' },
  { pattern: /\b(slogan|motto|claim)\b/i, type: 'slogan' },
];

export function detectContentType(query: string): string | null {
  for (const { pattern, type } of CONTENT_TYPE_PATTERNS) {
    if (pattern.test(query)) return type;
  }
  return null;
}

/**
 * Heuristic classification with confidence scoring.
 * Returns both the classification and a confidence score (0-1).
 *
 * High confidence (0.9+): Very clear patterns like greetings, explicit requests
 * Medium confidence (0.7-0.9): Keyword matches with some ambiguity
 * Low confidence (<0.7): Fuzzy matches or unclear patterns
 */
export function heuristicClassify(userContent: string): HeuristicResult {
  const q = userContent.toLowerCase();

  // High confidence (0.95): Greetings and thanks at start of message
  if (/^(hallo|hi|hey|guten|servus|moin|danke|vielen dank)/i.test(q.trim())) {
    return {
      intent: 'direct',
      searchQuery: null,
      reasoning: 'Greeting detected',
      confidence: 0.95,
    };
  }

  // High confidence (0.92): Image generation requests - very explicit patterns
  const imageKeywords =
    /\b(erstell|generier|visualisier|zeichne|male|illustrier).{0,20}(bild|grafik|illustration|foto|image|poster|sharepic)\b/i;
  const imageKeywordsAlt =
    /\b(bild|grafik|illustration|foto|poster|sharepic).{0,20}(erstell|generier|erzeug|mach)\b/i;
  if (imageKeywords.test(q) || imageKeywordsAlt.test(q)) {
    return {
      intent: 'image',
      searchQuery: null,
      reasoning: 'Image generation request detected',
      confidence: 0.92,
    };
  }

  // Medium confidence (0.70): Summary requests — only high-confidence when state confirms docs
  const summaryKeywords =
    /\b(fass[e]?\s+(das\s+|die\s+|den\s+)?zusammen|zusammenfass|zusammenfassung|kurzfassung|überblick\s+erstell)/i;
  if (summaryKeywords.test(q)) {
    return {
      intent: 'summary',
      searchQuery: null,
      reasoning: 'Summary keywords detected (needs document context for high confidence)',
      confidence: 0.7,
    };
  }

  // High confidence (0.88): Chart/data visualization requests
  const chartKeywords =
    /\b(diagramm|balkendiagramm|kreisdiagramm|liniendiagramm|tortendiagramm|chart|graph\b.{0,10}erstell|visualisier.{0,15}(daten|statistik|chart|werte))\b/i;
  if (chartKeywords.test(q)) {
    return {
      intent: 'chart',
      searchQuery: userContent,
      reasoning: 'Chart/visualization request detected',
      confidence: 0.88,
    };
  }

  // High confidence (0.90): Explicit web search request
  const explicitWebSearch =
    /\b(such|suche|durchsuche|finde?)\s*(im|das|den|die|in)?\s*(netz|internet|web|online)\b/i;
  if (explicitWebSearch.test(q)) {
    return {
      intent: 'web',
      searchQuery: userContent,
      reasoning: 'Explicit web search request',
      confidence: 0.9,
    };
  }

  // High confidence (0.88): Explicit research request
  if (/\b(recherchiere|recherche|recherchier)\b/.test(q)) {
    return {
      intent: 'research',
      searchQuery: userContent,
      reasoning: 'Explicit research request',
      confidence: 0.88,
    };
  }

  // Medium-high confidence (0.85): Party document searches - clear Green party keywords
  if (
    /\b(grüne|partei|programm|position|wahlprogramm|beschluss|antrag|grundsatzprogramm)\b/i.test(q)
  ) {
    return {
      intent: 'search',
      searchQuery: userContent,
      reasoning: 'Party document query',
      confidence: 0.85,
    };
  }

  // Medium confidence (0.80): Web/news searches - could be ambiguous
  if (/\b(aktuell|heute|gestern|news|nachricht|kürzlich)\b/i.test(q)) {
    return {
      intent: 'web',
      searchQuery: userContent,
      reasoning: 'Current events query',
      confidence: 0.8,
    };
  }

  // Medium confidence (0.78): "Wer ist" queries - route to web search
  if (/\bwer (ist|war|sind)\b/i.test(q)) {
    return {
      intent: 'web',
      searchQuery: userContent,
      reasoning: 'Person query routed to web search',
      confidence: 0.78,
    };
  }

  // Medium confidence (0.80): Examples search - requires both keywords
  if (
    /\b(beispiel|vorlage|social media|post|tweet|instagram)\b/i.test(q) &&
    /\b(zeig|such|find)\b/i.test(q)
  ) {
    return {
      intent: 'examples',
      searchQuery: userContent,
      reasoning: 'Social media examples query',
      confidence: 0.8,
    };
  }

  // Medium confidence (0.75): Fact-based content types with topic markers
  const factBasedContent =
    /\b(pressemitteilung|pressemeldung|pm|artikel|beitrag|blogpost|rede|ansprache|statement|argumentation|argumente|faktencheck|analyse|bericht|report)\b/i;
  const hasTopicMarker = /(?:^|\s)(über|zu|zum|zur|bezüglich|betreffend|thema)(?:\s|$)/i;

  if (factBasedContent.test(q) && hasTopicMarker.test(q)) {
    return {
      intent: 'research',
      searchQuery: userContent,
      reasoning: 'Fact-based content type with topic detected',
      contentType: detectContentType(q),
      confidence: 0.75,
    };
  }

  // Medium confidence (0.72): Creative tasks without explicit research need
  if (
    /\b(schreib|erstell|formulier|verfass)[etn]*/i.test(q) &&
    !/\b(recherch|such|find|info)\b/i.test(q)
  ) {
    return {
      intent: 'direct',
      searchQuery: null,
      reasoning: 'Creative task without research need',
      contentType: detectContentType(q),
      confidence: 0.72,
    };
  }

  // Low confidence (0.65): Fuzzy matching for typos - inherently uncertain
  const words = q.split(/\s+/).filter((w) => w.length >= 4);
  for (const word of words) {
    const fuzzyIntent = fuzzyMatchIntent(word);
    if (fuzzyIntent) {
      return {
        intent: fuzzyIntent,
        searchQuery: fuzzyIntent === 'image' ? null : userContent,
        reasoning: `Fuzzy matched "${word}" to ${fuzzyIntent}`,
        confidence: 0.65,
      };
    }
  }

  // Low confidence (0.50): Default to direct for unclear queries - needs LLM
  return {
    intent: 'direct',
    searchQuery: null,
    reasoning: 'No clear search intent detected',
    confidence: 0.5,
  };
}

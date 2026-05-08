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
    | 'direct'
    | 'image_edit'
    | 'sharepic'
    | 'save_as_doc'
    | 'modify_doc'
    | 'edit_current_doc'
    | 'modify_board'
    | 'share_doc'
  >,
  string[]
> = {
  research: ['recherchiere', 'recherche', 'untersuche', 'analysiere', 'erforsche'],
  // 'compare' is upgraded post-classification (≥2 doc sources + compare verbs);
  // keep this list empty so the heuristic doesn't fire it on single-doc queries.
  compare: [],
  image: ['visualisiere', 'zeichne', 'illustriere', 'grafik', 'illustration'],
  web: ['internet', 'netz', 'online', 'aktuell', 'nachricht', 'news'],
  search: ['wahlprogramm', 'beschluss', 'grundsatzprogramm'],
  examples: ['beispiel', 'vorlage', 'tweet', 'instagram', 'social'],
  summary: ['zusammenfassung', 'zusammenfassen', 'kurzfassung', 'überblick'],
  chart: ['diagramm', 'balkendiagramm', 'kreisdiagramm', 'liniendiagramm', 'chart', 'statistik'],
};

// `image_edit` is intentionally NOT in INTENT_KEYWORDS: a bare "bearbeite" with
// no image context (attachment or explicit noun) means "edit the text", not
// "edit a picture". Routing to `image_edit` requires combining the verb match
// below with an image signal that only classifierNode sees, so we expose the
// predicates separately instead of letting fuzzyMatchIntent fire on its own.
//
// We anchor with `(?:^|\W)` instead of `\b` because JS `\b` is ASCII-only —
// a space-then-`ä` pair is non-word→non-word and yields no boundary, so
// `\bändere` would silently fail. `(?:^|\W)` consumes the space (or matches
// start-of-string) and works for both ASCII and umlaut alternatives.
const IMAGE_EDIT_VERB_PATTERN =
  /(?:^|\W)(bearbeit|editier|modifizier|transformier|umwandl|ändere|ändern|aender|mach\s+\S.{0,40}?\s+(?:rein|dazu|hinein|drauf)|f(?:ü|ue)g(?:e)?\s+\S.{0,40}?\s+hinzu|edit|change)/i;

const IMAGE_NOUN_PATTERN =
  /(?:^|\W)(bild|bilds|foto|fotos|image|images|picture|pictures|photo|photos)(?:$|\W)/i;

/**
 * True when the user's text contains an image-edit verb (e.g. "bearbeite",
 * "ändere", "mach mehr Bäume rein").
 */
export function hasImageEditVerb(text: string): boolean {
  return IMAGE_EDIT_VERB_PATTERN.test(text);
}

/**
 * True when the user's text mentions a picture/photo/image noun, used to
 * recognise the no-attachment edit case ("bearbeite das Foto").
 */
export function mentionsImageNoun(text: string): boolean {
  return IMAGE_NOUN_PATTERN.test(text);
}

// Document mutation verbs — used by classifierNode to route `edit_current_doc`
// (open doc in editor) and `modify_doc` (collaborative doc mention) intents.
// Same `(?:^|\W)` anchor reasoning as IMAGE_EDIT_VERB_PATTERN above: JS `\b` is
// ASCII-only and silently fails before an umlaut. We list both umlaut and
// ASCII-folded stems because `userContent` is NOT folded before testing.
//
// Separable-verb constructions ("füge X ein", "passe X an", "schreib X um")
// use the `\S.{0,40}?` intervening-words window from IMAGE_EDIT_VERB_PATTERN.
export const DOC_MODIFY_PATTERN =
  /(?:^|\W)(aender|änder|ergaenz|ergänz|aktualisier|ueberarbeit|überarbeit|f(?:ü|ue)g(?:e)?\s+\S.{0,40}?\s+(?:hinzu|ein)|einf(?:ü|ue)g|vereinfach|umschreib|schreib\s+\S.{0,40}?\s+(?:um|neu)|kuerz|kürz|erweiter|ersetz|umformulier|formulier\s+\S.{0,40}?\s+(?:um|neu)|verbesser|korrigier|anpass|pass\s+\S.{0,40}?\s+an)/i;

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
  const result = stripped.length > 3 && stripped.length < query.length * 0.9 ? stripped : query;

  // Cap search queries — long queries dilute semantic similarity and waste embedding tokens
  const MAX_SEARCH_QUERY_LENGTH = 500;
  if (result.length > MAX_SEARCH_QUERY_LENGTH) {
    const truncated = result.slice(0, MAX_SEARCH_QUERY_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > MAX_SEARCH_QUERY_LENGTH * 0.8 ? truncated.slice(0, lastSpace) : truncated;
  }

  return result;
}

/**
 * Extract text content from a message, handling both string and AI SDK v6 parts format.
 */
export function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && typeof p === 'object' && (p as Record<string, unknown>).type === 'text')
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

  // High confidence (0.90): Save as document requests.
  // Bare "als Dokument/Protokoll/Notiz/Checkliste" must be paired with an explicit
  // save imperative — otherwise prose mentions like "Pressemitteilung über das Dokument"
  // or "gilt als Protokoll" would falsely trigger document creation.
  const saveImperative = /\b(speicher|abspeicher|sicher|exportier|ableg|festhalt|merk)[etns]*\b/i;
  const saveAsBarePattern = /\bals\s+(neues\s+)?(dokument|protokoll|notiz|checkliste)\b/i;
  const docWithVerbPattern =
    /\b(dokument|protokoll|notiz|checkliste)\s+(erstellen|speichern|anlegen|abspeichern|exportieren)\b/i;
  const machDarausPattern =
    /\bmach[etn]*\b.{0,15}\b(dokument|protokoll|notiz|checkliste)\s+daraus\b/i;

  if (
    (saveAsBarePattern.test(q) && saveImperative.test(q)) ||
    docWithVerbPattern.test(q) ||
    machDarausPattern.test(q)
  ) {
    return {
      intent: 'save_as_doc',
      searchQuery: null,
      reasoning: 'Save as document request detected',
      confidence: 0.9,
    };
  }

  // High confidence (0.88): Share document with group
  if (
    /\b(teil[e]?\s+(das\s+)?(mit|an)\s+|share\s+mit|freigeben\s+für|send[e]?\s+an\s+(gruppe|ag\s|kv\s|ov\s))/i.test(
      q
    )
  ) {
    return {
      intent: 'share_doc',
      searchQuery: null,
      reasoning: 'Share document request detected',
      confidence: 0.88,
    };
  }

  // High confidence (0.85): Summary requests — unambiguous patterns
  const summaryKeywords =
    /\b(fass[e]?\s+(das\s+|die\s+|den\s+)?zusammen|zusammenfass|zusammenfassung|kurzfassung|überblick\s+erstell)/i;
  if (summaryKeywords.test(q)) {
    return {
      intent: 'summary',
      searchQuery: null,
      reasoning: 'Summary keywords detected',
      confidence: 0.85,
    };
  }

  // High confidence (0.88): Chart/data visualization requests.
  // Bare chart-type nouns must be paired with a creation imperative — otherwise
  // prose mentions like "Im Diagramm sehen wir..." or "Erkläre mir das Chart" trigger.
  const chartTypeNoun =
    /\b(diagramm|balkendiagramm|kreisdiagramm|liniendiagramm|tortendiagramm|chart|graph)\b/i;
  const chartCreateImperative =
    /\b(erstell|generier|mach|bau|baue|visualisier|zeig|zeichn|erzeug|stell)[etn]*\b/i;
  const dataVisualizePattern = /\bvisualisier.{0,15}(daten|statistik|chart|werte|zahlen)\b/i;

  if ((chartTypeNoun.test(q) && chartCreateImperative.test(q)) || dataVisualizePattern.test(q)) {
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

  // Medium-high confidence (0.82): Explicit question about party positions
  // Only triggers search when user asks a QUESTION — party keywords alone never trigger search
  if (
    /\b(was|wie|welche[rsnm]?|wo|wann|warum|gibt\s+es|haben\s+die|sagen\s+die)\b/i.test(q) &&
    /\b(grüne|partei|programm|position|wahlprogramm|beschluss|antrag|grundsatzprogramm)\b/i.test(q)
  ) {
    return {
      intent: 'search',
      searchQuery: userContent,
      reasoning: 'Question about party positions detected',
      confidence: 0.82,
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

  // Medium confidence (0.80): Examples/social media — platform keyword + any action verb
  if (
    /\b(beispiel|vorlage|social\s*media|post|tweet|instagram)\b/i.test(q) &&
    /\b(zeig|such|find|erstell|schreib|mach|generier)[etn]*/i.test(q)
  ) {
    return {
      intent: 'examples',
      searchQuery: userContent,
      reasoning: 'Social media examples query',
      confidence: 0.8,
    };
  }

  // Medium-high confidence (0.82): Creative tasks with substantial user-provided context
  // When user pastes long content (>500 chars) with a creative verb, it's self-contained
  const isCreativeTask =
    /\b(schreib|erstell|formulier|verfass)[etn]*/i.test(q) &&
    !/\b(recherch|such|find|info)\b/i.test(q);

  if (isCreativeTask && userContent.length > 500) {
    return {
      intent: 'direct',
      searchQuery: null,
      reasoning: 'Creative task with substantial user-provided context',
      contentType: detectContentType(q),
      confidence: 0.82,
    };
  }

  // Medium confidence (0.75): Creative tasks without explicit research need
  if (isCreativeTask) {
    return {
      intent: 'direct',
      searchQuery: null,
      reasoning: 'Creative task without research need',
      contentType: detectContentType(q),
      confidence: 0.75,
    };
  }

  // Medium confidence (0.68): Fact-based content types with topic markers → direct (not research)
  // Content type is useful metadata but does NOT imply research is needed.
  // Users on this platform typically provide their own content and want AI to write/format it.
  const factBasedContent =
    /\b(pressemitteilung|pressemeldung|pm|artikel|beitrag|blogpost|rede|ansprache|statement|argumentation|argumente|faktencheck|analyse|bericht|report)\b/i;
  const hasTopicMarker = /(?:^|\s)(über|zu|zum|zur|bezüglich|betreffend|thema)(?:\s|$)/i;

  if (factBasedContent.test(q) && hasTopicMarker.test(q)) {
    return {
      intent: 'direct',
      searchQuery: null,
      reasoning: 'Fact-based content type detected (creative task, not research)',
      contentType: detectContentType(q),
      confidence: 0.68,
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

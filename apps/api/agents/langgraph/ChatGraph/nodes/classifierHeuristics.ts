/**
 * Classifier Heuristics
 *
 * Pattern-matching "fast path" for intent classification.
 * High-confidence patterns skip the LLM call entirely.
 */

import { findBestMatch } from '@gruenerator/shared/utils';

import { escapeRegExp } from '../../../../services/BaseSearchService/textUtils.js';
import { createLogger } from '../../../../utils/logger.js';

import { isMetaQuestionAbout, negatedOrMeta, stripQuotedSpans } from './fastPathGuards.js';

// Generation intents reachable via the fuzzy keyword fallback (only `image`,
// via 'grafik'/'illustration'); negated/meta artifact words must not match them.
const GENERATION_FUZZY_INTENTS = new Set<SearchIntent>(['image']);
import { CLASSIFIER_CONTEXT_MESSAGES, CLASSIFIER_CONTEXT_MAX_CHARS } from './classifierPrompt.js';

import type { SearchIntent, SocialTextPlatform, ClassificationResult } from '../types.js';
import type { ModelMessage } from 'ai';

const log = createLogger('ChatGraph:Classifier');

// ── Combined social post (EXPERIMENTAL) ─────────────────────────────────────
// Shared by the heuristic fast-path and the classifier's dedicated branches so
// escape hatches and platform detection can't drift between tiers.

/**
 * "nur den Text" / "ohne Sharepic" / "nur der Wortlaut" — user wants the caption
 * only. Compound "-text" nouns ("Posttext", "Beitragstext", "Social-Media-Text")
 * and `wortlaut`/`bildunterschrift` are unambiguously text-only, so they escape
 * even without a "nur"; a bare "Text" stays combined (it often means the post's
 * text, not text-instead-of-graphic) and needs a "nur"/"reine" qualifier.
 */
export const SOCIAL_TEXT_ONLY_PATTERN =
  /\b(nur|bloß|bloss|lediglich|reine[rn]?)\s+(den\s+|einen\s+|die\s+)?(post-?|caption-?)?(text|wortlaut|caption)\b|\b(post|beitrag|social[-\s]?media|caption)s{0,2}[-\s]?text\b|\b(wortlaut|bildunterschrift)\b|\bohne\s+(sharepic|grafik|bild)\b/i;

/** "nur ein Sharepic" / "ohne Text" — user wants the graphic only. */
export const SHAREPIC_ONLY_PATTERN =
  /\bnur\s+(ein\s+)?(sharepic|spruchbild|zitatbild|grafik)\b|\bohne\s+(post-?|caption-?)?text\b/i;

/** Explicit sharepic wording keeps routing to the shipped sharepic-only flow. */
export const SHAREPIC_NOUN_PATTERN =
  /\b(share[\s-]?pics?|sharepics?|spruchbild\w*|zitatbild\w*)\b/i;

/**
 * "Post MIT Sharepic" / "inkl. Sharepic" is the explicit combined ask — the
 * sharepic noun here is inclusion, not exclusion, so it must NOT act as a
 * sharepic-only escape.
 */
export const SHAREPIC_INCLUSION_PATTERN =
  /\b(mit|inkl\w*\.?|und|plus|samt)\s+(dazu\s+)?(ein(em)?\s+)?(passende[mn]?\s+)?(share[\s-]?pics?|sharepics?|spruchbild\w*|zitatbild\w*|grafik)\b/i;

const INSTAGRAM_PLATFORM_PATTERN = /\b(instagram|insta|reels?|story)\b/i;
const FACEBOOK_PLATFORM_PATTERN = /\b(facebook|fb|fb-?post|fb-?beitrag)\b/i;
// Mastodon/Bluesky share Twitter's 280-char budget (see prompts/social.json).
const TWITTER_PLATFORM_PATTERN = /\b(twitter|tweets?|tweete\w*|x-?post|bluesky|mastodon)\b/i;
const LINKEDIN_PLATFORM_PATTERN = /\blinked-?in\b/i;

/**
 * Platform hint from the user prompt. Null = no platform named (generic).
 * Instagram/Facebook win over Twitter/LinkedIn to preserve the pre-existing
 * two-platform detection order.
 */
export function detectSocialPlatform(text: string): SocialTextPlatform | null {
  if (INSTAGRAM_PLATFORM_PATTERN.test(text)) return 'instagram';
  if (FACEBOOK_PLATFORM_PATTERN.test(text)) return 'facebook';
  if (TWITTER_PLATFORM_PATTERN.test(text)) return 'twitter';
  if (LINKEDIN_PLATFORM_PATTERN.test(text)) return 'linkedin';
  return null;
}

/** Creation verb: user wants a post WRITTEN, not examples shown. */
export const SOCIAL_CREATE_VERB_PATTERN =
  /\b(erstell|schreib|mach|generier|verfass|formulier|entwirf|entwerf|bastel|produzier|dichte|tweete)\w*/i;

/** Bare noun-phrase prompts ("Instagram-Post zu Tempo 30") carry no verb. */
export const SOCIAL_BARE_NOUN_PATTERN =
  /^\s*(bitte\s+)?(ein(en)?\s+)?((insta(gram)?|facebook|fb|linkedin|twitter|x|tiktok)[-\s]?)?(post(ing)?|beitrag|tweet|reels?|caption|social[-\s]?media[-\s]?post)\b/i;

/** Question-shaped messages must not trigger post creation. */
export const SOCIAL_META_QUESTION_PATTERN = /^\s*(wie|was|wer|warum|wieso|welche|wann|wo)\b/i;

/**
 * Above this length the message likely carries pasted reference material
 * (Beschluss, Doku-Seite). Nouns inside a paste ("Sharepics", "Instagram")
 * describe content, they are not the user's ask — noun-triggered fast paths
 * stand down so the LLM tier can separate instruction from material.
 */
export const NOUN_TRIGGER_MAX_LENGTH = 500;

// Hoisted 'g' copy for matchAll (which clones internally, so sharing is safe).
const SOCIAL_CREATE_VERB_PATTERN_G = new RegExp(SOCIAL_CREATE_VERB_PATTERN.source, 'gi');

/**
 * True when `nounPattern` matches within `window` chars of a creation verb.
 * Guards verb+noun rules against pairing the instruction's verb ("schreibe …")
 * with a noun hundreds of chars away inside pasted material.
 */
export function nounNearCreateVerb(text: string, nounPattern: RegExp, window = 120): boolean {
  // Nouns are the rare token — bail before the verb scan for the common case.
  if (!nounPattern.test(text)) return false;
  const verbIndices = [...text.matchAll(SOCIAL_CREATE_VERB_PATTERN_G)].map((m) => m.index ?? 0);
  if (verbIndices.length === 0) return false;
  for (const noun of text.matchAll(new RegExp(nounPattern.source, 'gi'))) {
    const nounIndex = noun.index ?? 0;
    if (verbIndices.some((v) => Math.abs(nounIndex - v) <= window)) return true;
  }
  return false;
}

/** Trigger nouns for the heuristic social rules below (narrower than the classifier's SOCIAL_NOUN_PATTERN). */
const SOCIAL_TRIGGER_NOUN_PATTERN = /\b(social\s*media|post|tweet|instagram)\b/i;

/**
 * Escape hatches for a message that would otherwise route to `social_post`:
 * "nur Text" keeps today's examples-grounded text flow, "nur Sharepic" /
 * exclusionary sharepic wording keeps the shipped sharepic-only flow.
 * Inclusion phrasing ("Post mit Sharepic") stays combined — it is the most
 * explicit combined ask there is.
 */
export function resolveSocialPostEscape(text: string): 'examples' | 'sharepic' | null {
  if (SOCIAL_TEXT_ONLY_PATTERN.test(text)) return 'examples';
  if (SHAREPIC_ONLY_PATTERN.test(text)) return 'sharepic';
  if (SHAREPIC_INCLUSION_PATTERN.test(text)) return null;
  if (SHAREPIC_NOUN_PATTERN.test(text)) return 'sharepic';
  return null;
}

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
    | 'create_sheet'
    | 'create_presentation'
    // create_recurring_task is LLM-classified (needs a schedule); no keyword heuristic.
    | 'create_recurring_task'
    | 'modify_doc'
    | 'edit_current_doc'
    | 'modify_board'
    | 'edit_current_board'
    | 'share_doc'
    | 'pressemitteilung_examples'
    // scrape_url is detected by URL presence in the message (extractUrls), not keywords.
    | 'scrape_url'
    // artifact is detected by a dedicated pattern (noun + create imperative), not keywords.
    | 'artifact'
    // compute is detected by dedicated count/math/unit/date patterns, not keywords.
    | 'compute'
    // agentic is a router disposition (loop demotion), never keyword-matched.
    | 'agentic'
    // social_post is detected by the dedicated creation-verb + social-noun rule, not keywords.
    | 'social_post'
    // chat_history is detected by the dedicated past-conversation regex, not keywords.
    | 'chat_history'
    // mcp (EXPERIMENTAL) is gated via the @mcp mention + conservative LLM prose,
    // never keyword-classified (would misfire on generic "tool"/"server" words).
    | 'mcp'
    // System MCP intents (EXPERIMENTAL) are LLM-classified only — bare keywords
    // like "bahn"/"wetter"/"news" would hijack policy queries (Bahnreform,
    // Klimapolitik, Nachrichten über X).
    | 'bahn'
    | 'reise'
    | 'hotel'
    | 'wetter'
    | 'news'
    | 'umfragen'
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
  abgeordnetenwatch: [
    'abstimmungsverhalten',
    'nebentätigkeit',
    'nebentätigkeiten',
    'nebeneinkünfte',
    'namentliche abstimmung',
  ],
  bundestag: [
    'drucksache',
    'bt-drs',
    'plenarprotokoll',
    'plenardebatte',
    'bundestagsdebatte',
    'bundestagsrede',
    'gesetzentwurf',
    'kleine anfrage',
    'große anfrage',
    'gesetzgebungsverfahren',
  ],
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

// Bare image-generation nouns, for the negation/meta guard on the image fast path.
const IMAGE_GEN_NOUN_PATTERN = /\b(bild|grafik|illustration|foto|image|poster)\b/i;

// Regenerate-the-last-image phrasings that carry no edit verb/noun ("nochmal,
// aber abends", "neue Version", "mach es wärmer"). Used ONLY with an image
// lastToolContext so it can't hijack unrelated turns.
const IMAGE_REGEN_PATTERN =
  /(?:^|\W)(nochmal[s]?|noch ?(?:ein(?:e?s)?|mal)\b|neue[srn]?\s+(?:version|variante)|neu\s+(?:generier|erstell)\w*|anders(?![a-zäöüß])|stattdessen|andere[srn]?\s+(?:stil|farbe|version|variante|hintergrund)|mach\s+(?:es|das|ihn|sie)\s+\w+er\b|(?:lieber|besser)\s+(?:mit|ohne|als)\b)/i;

// "nochmal" can also mean repeat-the-ANSWER — explain/repeat verbs keep the
// prose path. Question-initial messages ("Was war nochmal der Prompt?") too.
const ANSWER_REPEAT_PATTERN =
  /(?:^|\W)(erkl(?:ä|ae)r|erz(?:ä|ae)hl|beschreib|wiederhol|begr(?:ü|ue)nd|zusammenfass|fass\b|antwort|sag\s+(?:mir|es|das)|warum|wieso|weshalb)/i;

/**
 * True when a follow-up asks to regenerate the last image (not edit it, not
 * repeat the answer). Caller must gate on an image lastToolContext.
 */
export function isImageRegenRequest(text: string): boolean {
  if (/^\s*(was|wie|wer|warum|wieso|welche|wann|wo)\b/i.test(text)) return false;
  return IMAGE_REGEN_PATTERN.test(text) && !ANSWER_REPEAT_PATTERN.test(text);
}

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
//
// Strategy: this regex is the **fast path** that catches ~85% of explicit
// edit requests with zero latency. The classifier pairs it with an LLM
// tiebreak (see `docsIntentTiebreak.ts`) for the residual cases (indirect
// phrasings, comparative imperatives like "mach das knackiger", colloquial
// or English requests). DO NOT try to make this regex exhaustive — that's
// the LLM's job. Only add stems for verbs frequent enough to justify
// bypassing the LLM call.
export const DOC_MODIFY_PATTERN =
  /(?:^|\W)(aender|änder|bearbeit|ergaenz|ergänz|aktualisier|ueberarbeit|überarbeit|f(?:ü|ue)g(?:e)?\s+\S.{0,40}?\s+(?:hinzu|ein)|einf(?:ü|ue)g|vereinfach|umschreib|schreib\s+\S.{0,40}?\s+(?:um|neu)|kuerz|kürz|erweiter|verläng|verlaenger|ersetz|umformulier|formulier\s+\S.{0,40}?\s+(?:um|neu)|verbesser|korrigier|anpass|pass\s+\S.{0,40}?\s+an|entfern|loesch|lösch|streich|(?:ü|ue)bersetz|mach\s+\S.{0,40}?\s+(?:k(?:ü|ue)rzer|l(?:ä|ae)nger|pr(?:ä|ae)ziser|kompakter|pr(?:ä|ae)gnanter|knackiger|schlagkr(?:ä|ae)ftiger|verst(?:ä|ae)ndlicher|freundlicher|formeller|pers(?:ö|oe)nlicher))/i;

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

/** The user's RAW last message. Preferred over searchQuery: when the router's
 *  regex gate fires on a search-classified follow-up, searchQuery holds the
 *  retrieval-optimized rewrite (or null for direct/summary/chart intents) —
 *  consumers must judge against the actual question. */
export function lastUserText(state: { messages?: ModelMessage[] }): string {
  const messages = state.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === 'user') return extractMessageText(msg.content);
  }
  return '';
}

/**
 * Detect http(s) URLs in user-typed text. Ported from the frontend's
 * `urlDetection.ts` regex (web/api boundary forbids a cross-import). Used by the
 * classifier to route pasted links to the `scrape_url` intent so their page
 * content becomes chat context. Strips trailing sentence punctuation and dedupes.
 */
const URL_PATTERN =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(URL_PATTERN);
  if (!matches) return [];
  const seen = new Set<string>();
  for (const raw of matches) {
    // Trim trailing punctuation that commonly follows a URL in prose.
    const cleaned = raw.replace(/[.,;:!?)\]}'"]+$/, '');
    if (cleaned) seen.add(cleaned);
  }
  return [...seen];
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

// Unit conversion needs a TARGET unit after the preposition — a bare
// "in"/"als" matches everyday German ("Tempo 30 in der Innenstadt",
// "35 °C in Berlin") and hijacked post creation into compute. "in" is also
// not a source unit (inches are never written "30 in" in German). The unit
// boundary is `(?![a-zäöüß0-9])`, not `\b` — JS \b is ASCII-only, so `fuß\b`
// before a space can never match. Module scope: new RegExp compiles per
// call, unlike regex literals.
const UNIT_ALTERNATION =
  '(?:mm|cm|m|km|zoll|inch(?:es)?|ft|feet|fu(?:ß|ss)|yd|mi|miles?|meilen?|meter|kilometer|mg|g|kg|t|gramm|kilogramm|lbs?|pfund|oz|s|min|h|std|sekunden?|minuten?|stunden?|tage?|kb|mb|gb|tb|°?[cf]|grad|celsius|fahrenheit|kelvin)';
const UNIT_CONVERT_PATTERN = new RegExp(
  `\\b\\d+(?:[.,]\\d+)?\\s*(${UNIT_ALTERNATION})(?![a-zäöüß0-9])[\\s\\S]*?\\b(?:in|to|nach|als)\\s+(${UNIT_ALTERNATION})(?![a-zäöüß0-9])`,
  'i'
);

/**
 * "2 Grad Erwärmung, gemessen in Grad Celsius" repeats one unit — that is
 * prose, not a conversion ask. A real conversion names two different units.
 */
export function isUnitConversion(text: string): boolean {
  const m = UNIT_CONVERT_PATTERN.exec(text);
  return !!m && m[1].toLowerCase() !== m[2].toLowerCase();
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

// Leading greeting/thanks token(s) — strippable prefix. The trailing separator
// class eats punctuation/whitespace/commas so "Hallo! ", "Danke dir, " are
// consumed. `+` allows stacked greetings ("Hi, guten Morgen!").
const GREETING_PREFIX_PATTERN =
  /^\s*(?:(?:hallo|hi|hey|servus|moin|guten(?:\s+(?:morgen|tag|abend))?|danke(?:\s+(?:dir|euch|sch(?:ö|oe)n|sehr))?|vielen\s+dank)\b[\s,.!:;–—-]*)+/i;

// Remainders after a greeting that are still pure small-talk (assistant-directed,
// no real task) — these keep the direct@0.95 greeting fast path.
const SMALLTALK_REMAINDER_PATTERN =
  /^(wie geht(?:'?s|\s+es)?(?:\s+(?:dir|euch|ihnen))?\s*\??|wer bist du\s*\??|was kannst du(?:\s+alles)?\s*\??|kannst du (?:mir\s+)?(?:bitte\s+)?helfen\s*\??|alles (?:klar|gut)\s*[!?.]*|(?:das\s+)?passt(?:\s+so)?\s*[!.]*|(?:sehr\s+)?(?:gut|super|toll|perfekt|klasse)(?:\s+gemacht)?\s*[!.]*)$/i;

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
/**
 * Aggregation/calculation question over tabular data (Summe, Durchschnitt,
 * "pro X", Anteile …). Shared by the classifier fast path AND the contract
 * router's run_python gate: multi-turn confidence penalties (vague follow-up)
 * can push the heuristic below threshold, so the router re-checks the raw
 * question text — otherwise follow-ups like "durchschnittlicher umsatz pro
 * region?" silently fall back to the legacy prompt-guidance path.
 */
export function isTabularComputeQuestion(text: string): boolean {
  // Text-metric questions (Zeichen/Wörter zählen) belong to the plain-JS
  // computeNode even with a spreadsheet attached — counting characters of a
  // pasted text has nothing to do with `df` (beta regression: the run_python
  // gate hijacked "wie viele zeichen sind das hier").
  if (
    /(zeichen|buchstaben|w(?:ö|oe)rter|worte|wortanzahl|zeilen|vokale|silben|abs(?:ä|ae)tze)/i.test(
      text
    )
  ) {
    return false;
  }
  // Chart/visualization/sharepic requests keep their own intents even when
  // they mention aggregations ("balkendiagramm der umsätze pro monat").
  if (/(diagramm|\bchart|\bgraph|visualisier|sharepic|spruchbild|zitatbild)/i.test(text)) {
    return false;
  }
  // Verbs/measure words are bound to a word START — JS \b is ASCII-only and
  // 'zähl' must not fire inside 'erzähl'. Noun stems may sit inside German
  // compounds (jahresumsatz, gesamtgewinn), so they match anywhere.
  const wordStart =
    /(?:^|[^a-zäöüß])(summ|zähl|anzahl|anteil|filter|sortier|median|mittelwert|durchschnitt|prozent|maxim|minim|meist|häufigst|beste[rns]?\b|top ?\d|ausreißer|quartil|pivot|prognos|wie ?viel|pro\s+\w+)/i;
  const nounStem = /(umsatz|gewinn|erlös|gesamtsumme|gesamtwert|höchst|niedrigst)/i;
  return wordStart.test(text) || nounStem.test(text);
}

export function heuristicClassify(
  userContent: string,
  opts?: { hasTabularAttachment?: boolean }
): HeuristicResult {
  const q = userContent.toLowerCase();

  // Long messages likely embed pasted reference material — keyword-triggered
  // fast paths below defer to the LLM instead of firing on words inside the
  // paste ("Das Diagramm zeigt…", "Protokoll erstellen", "Sharepics", …).
  // Deliberately NOT applied to compute: counting words/chars of a pasted
  // text is compute's primary use case.
  const isLongPaste = userContent.length > NOUN_TRIGGER_MAX_LENGTH;

  // Quote-stripped view for noun-triggered fast paths: text inside quotes is
  // reported speech ("mein Kollege meinte: ‚Erstell ein Sharepic'"), not the
  // user's own ask. Negation/meta guards also run against this view.
  const qc = stripQuotedSpans(q);

  // High confidence (0.95): a message that is ONLY a greeting/thanks (or trivial
  // small-talk after it). A greeting PREFIX must not swallow a real ask that
  // follows it ("Hallo! Wie hat die CDU abgestimmt?") — strip the prefix and
  // re-classify the remainder instead.
  const trimmed = q.trim();
  const greet = GREETING_PREFIX_PATTERN.exec(trimmed);
  if (greet) {
    const rest = trimmed.slice(greet[0].length).trim();
    const restWords = rest ? rest.split(/\s+/).filter(Boolean).length : 0;
    if (
      rest.length === 0 ||
      SMALLTALK_REMAINDER_PATTERN.test(rest) ||
      (restWords <= 3 && !rest.includes('?'))
    ) {
      return {
        intent: 'direct',
        searchQuery: null,
        reasoning: 'Greeting detected',
        confidence: 0.95,
      };
    }
    // Substantive remainder: classify it instead of the greeting. Prefix length
    // is case-stable, so the same offset applies to the original-cased text. The
    // `+` in the prefix consumes all leading greetings, so this terminates.
    return heuristicClassify(userContent.trim().slice(greet[0].length).trim(), opts);
  }

  // High confidence (0.92): Aggregation/calculation question about an attached
  // spreadsheet. Routes to `compute` so the pipeline generates pandas code and
  // executes it client-side (run_python interrupt) instead of the model
  // answering from prose. Gated on hasTabularAttachment so plain-text chats
  // never match.
  if (opts?.hasTabularAttachment && isTabularComputeQuestion(q)) {
    return {
      intent: 'compute',
      searchQuery: userContent,
      reasoning: 'Tabular aggregation question with attached spreadsheet',
      confidence: 0.92,
    };
  }

  // High confidence (0.93): Sharepic requests — a branded social graphic, NOT a
  // free-form AI image. Checked BEFORE the generic image heuristic below, which
  // would otherwise swallow "sharepic" into the AI-image path. Matches the noun
  // anywhere ("mach mir ein zitat sharepic", "sharepic über X") plus the German
  // spelling variants ("spruchbild", "zitatbild"). The specific variant
  // (zitat/dreizeilen/info) is resolved later in the execution path from the same
  // text — here we only need to route to the sharepic intent.
  // "Post MIT Sharepic" is a combined ask — let the social_post rule below
  // take it instead of the sharepic-only fast path. Long-paste messages fall
  // through entirely: "Sharepics" inside pasted material (a docs page, a
  // Beschluss) describes content, and even verb proximity is no signal there
  // ("… hilft beim Erstellen … Alt-Texte für Sharepics"). The LLM prompt
  // knows the sharepic intent, so genuine long sharepic asks still route.
  const sharepicIsInclusion =
    SHAREPIC_INCLUSION_PATTERN.test(qc) && /\b(post(ing)?|beitrag|tweet|caption)\b/i.test(qc);
  if (
    SHAREPIC_NOUN_PATTERN.test(qc) &&
    !sharepicIsInclusion &&
    !isLongPaste &&
    !negatedOrMeta(qc, SHAREPIC_NOUN_PATTERN)
  ) {
    return {
      intent: 'sharepic',
      searchQuery: null,
      reasoning: 'Sharepic request detected',
      confidence: 0.93,
    };
  }

  // High confidence (0.92): Image generation requests - very explicit patterns.
  // The `.{0,20}` window between verb and noun can swallow a negation ("erstell
  // daraus bitte KEINE Grafik"), so the negation guard runs on the whole message.
  const imageKeywords =
    /\b(erstell|generier|visualisier|zeichne|male|illustrier).{0,20}(bild|grafik|illustration|foto|image|poster)\b/i;
  const imageKeywordsAlt =
    /\b(bild|grafik|illustration|foto|poster).{0,20}(erstell|generier|erzeug|mach)\b/i;
  if (
    !isLongPaste &&
    (imageKeywords.test(qc) || imageKeywordsAlt.test(qc)) &&
    !negatedOrMeta(qc, IMAGE_GEN_NOUN_PATTERN)
  ) {
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
  const DOC_ARTIFACT_NOUN_PATTERN = /\b(dokument|protokoll|notiz|checkliste)\b/i;

  if (
    !isLongPaste &&
    ((saveAsBarePattern.test(qc) && saveImperative.test(qc)) ||
      docWithVerbPattern.test(qc) ||
      machDarausPattern.test(qc)) &&
    !negatedOrMeta(qc, DOC_ARTIFACT_NOUN_PATTERN)
  ) {
    return {
      intent: 'save_as_doc',
      searchQuery: null,
      reasoning: 'Save as document request detected',
      confidence: 0.9,
    };
  }

  // High confidence (0.9): Presentation-deck creation. create_presentation lives
  // only in the LLM prompt, and the intermediate classifier model is unreliable
  // on this newer intent — so an explicit "erstelle eine Präsentation über X"
  // was falling back to a prose slide outline instead of building a deck.
  // Fast-path the unambiguous phrasing (creation verb + deck noun).
  const PRESENTATION_NOUN_PATTERN = /\b(präsentation|foliensatz|folien|slides?|pitch[\s-]?deck)\b/i;
  const presentationCreatePattern =
    /\b(erstell|mach|generier|bau|entwirf|erzeug)[a-zäöü]*\b.{0,40}\b(präsentation|foliensatz|folien|slides?|pitch[\s-]?deck)\b/i;
  if (
    !isLongPaste &&
    presentationCreatePattern.test(qc) &&
    !negatedOrMeta(qc, PRESENTATION_NOUN_PATTERN)
  ) {
    return {
      intent: 'create_presentation',
      searchQuery: null,
      reasoning: 'Presentation creation request detected',
      confidence: 0.9,
    };
  }

  // High confidence (0.88): Share document with group
  if (
    !isLongPaste &&
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

  // High confidence (0.85): Summary requests. The `fass … zusammen` alternative
  // allows a bounded object between the separable verb and its particle ("fass
  // die wichtigsten Argumente aus der Debatte zusammen") — without it the
  // deterministic path missed the phrasing and handed a flaky decision to the
  // temp-0.1 LLM. `fass[e]?` keeps excluding third-person "fasst".
  const summaryKeywords =
    /\b(fass[e]?\s+(?:\S[^.!?\n]{0,60}?\s+)?zusammen\b|zusammenfass|zusammenfassung|kurzfassung|überblick\s+erstell)/i;
  if (!isLongPaste && summaryKeywords.test(qc) && !negatedOrMeta(qc, summaryKeywords)) {
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

  if (
    !isLongPaste &&
    ((chartTypeNoun.test(qc) && chartCreateImperative.test(qc)) || dataVisualizePattern.test(qc)) &&
    !negatedOrMeta(qc, chartTypeNoun)
  ) {
    return {
      intent: 'chart',
      searchQuery: userContent,
      reasoning: 'Chart/visualization request detected',
      confidence: 0.88,
    };
  }

  // High confidence (0.90): Standalone spreadsheet creation. Mirrors
  // create_presentation — create_sheet lives only in the LLM prompt and the
  // intermediate model is unreliable on it, so "Erstell mir eine Tabelle mit X"
  // fell to `direct`. Placed AFTER chart ("erstell ein Diagramm aus der Tabelle"
  // stays chart) and BEFORE compute ("berechne die Tabelle" stays compute — none
  // of these creation verbs is a compute verb). The tabular-attachment compute
  // gate above (0.92) still outranks this for attached-sheet questions.
  const SHEET_NOUN_PATTERN = /\b(tabelle|spreadsheet|sheets?|kalkulation(?:stabelle)?)\b/i;
  const sheetCreatePattern =
    /\b(erstell|mach|generier|bau|entwirf|erzeug|leg)[a-zäöü]*\b.{0,40}\b(tabelle|spreadsheet|sheets?|kalkulation(?:stabelle)?)\b/i;
  if (!isLongPaste && sheetCreatePattern.test(qc) && !negatedOrMeta(qc, SHEET_NOUN_PATTERN)) {
    return {
      intent: 'create_sheet',
      searchQuery: null,
      reasoning: 'Spreadsheet creation request detected',
      confidence: 0.9,
    };
  }

  // High confidence (0.85): Generic HTML/SVG artifact requests. Must pair an
  // artifact noun with a creation imperative so prose ("erklär mir HTML")
  // doesn't trigger. Placed after chart so diagram requests stay charts.
  const artifactNoun =
    /\b(html|svg|webseite|website|landingpage|landing-page|mockup|prototyp|vektorgrafik)\b/i;
  const artifactCreateImperative =
    /\b(erstell|generier|mach|bau|baue|erzeug|schreib|gestalt|entwirf|entwickl)[etn]*\b/i;
  if (
    !isLongPaste &&
    artifactNoun.test(qc) &&
    artifactCreateImperative.test(qc) &&
    !negatedOrMeta(qc, artifactNoun)
  ) {
    return {
      intent: 'artifact',
      searchQuery: userContent,
      reasoning: 'Generic HTML/SVG artifact request detected',
      confidence: 0.85,
    };
  }

  // High confidence (0.90): Deterministic calculation / counting. Narrow on
  // purpose — each sub-pattern names a concrete compute operation so ordinary
  // prose ("erklär mir Prozentrechnung") and factual questions don't misfire.
  // Placed after chart/artifact so "Diagramm mit Zahlen" stays a chart.
  const countPattern =
    /\b(z(?:ä|ae)hl\w*|anzahl|wie\s+viele?|wie\s+lang)\b[\s\S]*\b(zeichen|buchstaben|w(?:ö|oe)rter|worte|wortanzahl|zeilen|vokale|silben|absätze|abs(?:ä|ae)tze)\b/i;
  const pureExpr = /^(?=[\s\S]*[+\-*/%^×÷])[\s\d().,+\-*/%^×÷]+[=?]?$/;
  const mathPattern =
    /(\d+\s*%\s*(von|of)\s*\d+)|\b(rechne|berechne|wie\s?viel\s+(ist|sind|macht)|was\s+(ist|sind|ergibt)\s+\d)/i;
  const dateMath = /\b(wie\s+viele?\s+tage|tage\s+(bis|zwischen)|datum\s+in\s+\d)/i;
  if (
    countPattern.test(userContent) ||
    pureExpr.test(userContent.trim()) ||
    mathPattern.test(q) ||
    isUnitConversion(q) ||
    dateMath.test(q)
  ) {
    return {
      intent: 'compute',
      searchQuery: userContent,
      reasoning: 'Deterministic computation/counting request detected',
      confidence: 0.9,
    };
  }

  // High confidence (0.90): Explicit web search request
  const explicitWebSearch =
    /\b(such|suche|durchsuche|finde?)\s*(im|das|den|die|in)?\s*(netz|internet|web|online)\b/i;
  if (!isLongPaste && explicitWebSearch.test(qc) && !isMetaQuestionAbout(qc, explicitWebSearch)) {
    return {
      intent: 'web',
      searchQuery: userContent,
      reasoning: 'Explicit web search request',
      confidence: 0.9,
    };
  }

  // High confidence (0.88): Explicit research request
  const researchNoun = /\b(recherchiere|recherche|recherchier)\b/i;
  if (!isLongPaste && researchNoun.test(qc) && !isMetaQuestionAbout(qc, researchNoun)) {
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

  // Medium confidence (0.80): social media requests. Creation verbs route to
  // the EXPERIMENTAL combined post (text + sharepic) unless an escape hatch
  // ("nur Text", "nur Sharepic") applies; browse verbs ("zeig mir Beispiele")
  // keep the examples flow. Meta-questions never create. Verb and noun must
  // sit close together — "schreibe eine Produktvorstellung … [Paste erwähnt
  // Instagram]" is not a post ask.
  if (
    !isLongPaste &&
    nounNearCreateVerb(qc, SOCIAL_TRIGGER_NOUN_PATTERN) &&
    !/\b(beispiel|vorlage)\b/i.test(qc) &&
    !negatedOrMeta(qc, SOCIAL_TRIGGER_NOUN_PATTERN)
  ) {
    // Escape hatches ("ohne Sharepic", "nur Text") run on the raw text so the
    // negated-artifact word stays visible to resolveSocialPostEscape.
    const escape = resolveSocialPostEscape(q);
    return {
      intent: escape ?? 'social_post',
      searchQuery: userContent,
      reasoning: escape
        ? `Social media creation with "${escape}" escape hatch`
        : 'Social media post creation (combined text + sharepic)',
      confidence: 0.8,
    };
  }

  // Medium confidence (0.80): Examples/social media — platform keyword + any action verb
  if (
    !isLongPaste &&
    (/\b(beispiel|vorlage)\b/i.test(q) || SOCIAL_TRIGGER_NOUN_PATTERN.test(q)) &&
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

  if (isCreativeTask && isLongPaste) {
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

  // Low confidence (0.65): Fuzzy matching for typos - inherently uncertain.
  // A negated / meta-question artifact word ("keine Grafik", "was ist eine
  // Grafik?") must not fuzzy-match its generation intent.
  const words = q.split(/\s+/).filter((w) => w.length >= 4);
  for (const word of words) {
    const fuzzyIntent = fuzzyMatchIntent(word);
    if (fuzzyIntent) {
      if (GENERATION_FUZZY_INTENTS.has(fuzzyIntent)) {
        // fuzzyMatchIntent only returns INTENT_KEYWORDS keys.
        const kw = INTENT_KEYWORDS[fuzzyIntent as keyof typeof INTENT_KEYWORDS] ?? [];
        if (kw.length > 0) {
          const nounRe = new RegExp(`\\b(?:${kw.map(escapeRegExp).join('|')})`, 'i');
          if (negatedOrMeta(qc, nounRe)) continue;
        }
      }
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

/**
 * Classifier Response Parsing
 *
 * Parses LLM JSON responses with 3 fallback strategies,
 * plus heuristic complexity and search-source detection.
 */

import { createLogger } from '../../../../utils/logger.js';

import { extractFilters } from './classifierFilters.js';
import {
  CLASSIFIER_DOC_SUBTYPES,
  CLASSIFIER_OFFERED_INTENTS,
  CREATION_TOPIC_INTENTS,
  isOfferedIntent,
  NON_SEARCH_INTENTS,
} from './classifierPrompt.js';

import type { SearchIntent, SearchSource, ClassificationResult } from '../types.js';
import type { ClassifierLLMResponse } from './classifierFilters.js';

const log = createLogger('ChatGraph:Classifier');

/**
 * Scan order for the malformed-JSON fallback, in DESCENDING priority.
 *
 * Only a partial list: it exists because a malformed response can mention the
 * `intent:` field more than once, and then the first match wins. That is an
 * editorial call ("sharepic before image", "social_post before examples") and
 * has to stay hand-written.
 *
 * What must NOT be hand-written is the SET. This chain used to be twenty
 * hard-coded `if`s and nothing else, so twelve of the intents the prompt offers
 * — including create_sheet, create_presentation and create_recurring_task —
 * were undetectable here and fell through to `direct`. That is the very bug
 * `isOfferedIntent` was introduced to fix on the primary path (see
 * classifierPrompt.ts): the fix landed on one of the two doors.
 *
 * Now the ranked entries are followed by every remaining offered intent, so a
 * newly offered intent is at worst LOW priority and can never again be
 * invisible. Appending rather than prepending is deliberate: it cannot change
 * the outcome of any response the old chain already resolved.
 */
const FALLBACK_PRIORITY = [
  'sharepic',
  'image',
  'save_as_doc',
  'create_pdf',
  'share_doc',
  'chart',
  'summary',
  // System MCP intents — specific tokens, safe before the broad direct/search.
  'reise',
  'bahn',
  'wetter',
  'news',
  'hotel',
  'umfragen',
  'hilfe',
  'direct',
  // social_post before examples: 'examples' would otherwise never lose to it
  // in malformed responses that mention both.
  'social_post',
  'examples',
  'search',
  'web',
  'research',
] as const satisfies readonly SearchIntent[];

const FALLBACK_SCAN_ORDER: readonly SearchIntent[] = [
  ...FALLBACK_PRIORITY,
  ...CLASSIFIER_OFFERED_INTENTS.filter(
    (i) => !(FALLBACK_PRIORITY as readonly string[]).includes(i)
  ),
];

/**
 * Fallback intents whose executor searches the user's own text, so the raw
 * message is the query. Everything else gets `null` — the executor reads the
 * message itself and a stray query would only be noise.
 */
const FALLBACK_CARRIES_QUERY: ReadonlySet<string> = new Set<SearchIntent>([
  'chart',
  'news',
  'hilfe',
  'social_post',
  'examples',
  'search',
  'web',
  'research',
  'abgeordnetenwatch',
  'bundestag',
  'chat_history',
]);

/**
 * Phrases that reference the user's earlier work — a past conversation with the
 * assistant OR one of the user's own office documents (docs/presentations/
 * sheets) OR one of their reels (subtitled videos, matched on the spoken
 * transcript). Used both to add the `chat_history` search source (combined
 * queries) and to defensively upgrade a misclassified `direct` intent to the
 * `chat_history` tool.
 *
 * The reel alternatives are phrased as possessives ("mein reel", "das video in
 * dem ich") on purpose: a bare "reel"/"video" would grab reel CREATION and the
 * reel_edit turns, which are separate branches.
 */
/**
 * References to THIS conversation rather than an earlier one ("vorhin", "in
 * diesem Chat", "deine letzte Antwort"). Those need no retrieval at all — the
 * messages are already in context.
 *
 * Live failure this guards: "Du hast meine Frage nach dem Bundeskanzler vorhin
 * nicht beantwortet … was war meine allererste Frage in diesem Chat?" was
 * classified `chat_history`, ran a Qdrant recall over PAST threads, got 0 hits
 * and answered that no sources were available — while the answer sat a few
 * messages above.
 */
export const CURRENT_THREAD_REFERENCE =
  /\b(?:vorhin|eben\s+gerade|gerade\s+eben|weiter\s+oben|hier\s+im\s+chat|in\s+diesem\s+(?:chat|gespräch|thread|verlauf)|dieses\s+gespräch[s]?|deine[rn]?\s+(?:letzte|vorherige|obige)[rn]?\s+antwort|meine\s+(?:erste|allererste|letzte)\s+frage)\b/i;

/** Longer than this and the model returned prose, not a topic. */
const MAX_CREATION_TOPIC_LENGTH = 300;

/**
 * The classifier's answer to "what should this artifact be ABOUT", validated.
 *
 * Deliberately structural rather than lexical — no list of filler words to keep
 * up with. Exactly two things can go wrong and both are checkable without
 * knowing any German: the model answers for an intent that creates nothing, or
 * it hands back the instruction it was supposed to look past. `null` is a fine
 * answer; the callers fall back to `resolveReferentialTopic` and, failing that,
 * ask the user.
 */
export function validateCreationTopic(
  raw: string | null | undefined,
  intent: string,
  userContent: string
): string | null {
  if (typeof raw !== 'string') return null;
  const topic = raw.trim();
  if (!topic) return null;
  if (!CREATION_TOPIC_INTENTS.has(intent)) return null;
  // Echoing the message back means the model did not resolve anything — the
  // instruction as a topic is exactly the bug this field exists to fix.
  const normalize = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalize(topic) === normalize(userContent)) {
    log.warn(`[Classifier] creationTopic echoed the user message — dropped`);
    return null;
  }
  return topic.slice(0, MAX_CREATION_TOPIC_LENGTH);
}

export const CHAT_HISTORY_KEYWORDS =
  /\b(letzte[sn]?\s+gespräch|vorher\s+besprochen|letzte\s+woche|gestern\s+besprochen|was\s+haben\s+wir|erinnere?\s+dich|wir\s+hatten|früheres?\s+chat|voriges?\s+gespräch|damals\s+besprochen|da\s+weiter|wo\s+wir\s+aufgehört|mein(e|en)?\s+(dokument|präsentation|tabelle|notiz|antrag|board|kanban|tafel|reel|video|clip)|meine\s+(dokumente|präsentationen|tabellen|notizen|boards|reels|videos|clips)|die\s+tabelle\s+die\s+ich|das\s+dokument\s+das\s+ich|das\s+board\s+das\s+ich|das\s+(reel|video)\s+(das\s+ich|zu(m)?\s|über)|welches\s+(reel|video)|in\s+welchem\s+(reel|video))\b/i;

/**
 * Concrete travel / timetable / weather / news phrasings that map to a
 * system-MCP intent (hotel/reise/bahn/wetter/news). Those intents are
 * LLM-CLASSIFIED ONLY (excluded from the heuristic keyword table on purpose),
 * so a bare "suche hotels …" would otherwise be swallowed by Tier-3.5 loop
 * demotion → `agentic` before Tier 3.7 ever runs, and the system source never
 * mounts. This guards the demotion gate (mirrors CHAT_HISTORY_KEYWORDS, the
 * other LLM-only intent) so these phrasings reach the source-scope resolver.
 *
 * IT IS A GATE, NOT A CLASSIFIER, and since the resolver started releasing
 * `keine` verdicts back to demotion (classifierNode, Tier 3.7) that distinction
 * has teeth: a false positive here costs one ~700-character call and then lands
 * exactly where it would have landed anyway. That is why this list may be
 * generous where the old one had to be stingy — it used to send every false
 * positive to the 27k prompt for good. Recall is what matters; precision is the
 * resolver's job, and its prompt spends its last paragraph on precisely the
 * policy-vs-data line ("Bahnreform", "Tourismuspolitik", "Klimapolitik").
 *
 * The bare-noun alternatives still carry their own boundary — `bahn(?:en|hof…)?`
 * matches "Bahn"/"Bahnen"/"Bahnhof" but not "Bahnreform"; bare `wetter` matches
 * "das Wetter" but not "Wetterextreme"/"Unwetter" — because keeping obvious
 * policy compounds out of the resolver's inbox is free.
 *
 * BOUNDARIES ARE `\p{L}`-BASED, NOT `\b`, and that is load-bearing: `\b` needs a
 * transition between `\w` and non-`\w`, and without the `u` flag "ü" is not
 * `\w`. In " übernachten" both the space and the "ü" are non-`\w`, so there is
 * no boundary and the alternative could never fire — `[üu]bernacht\w+` matched
 * only the "ubernachten" spelling nobody writes. Every alternative that STARTS
 * with an umlaut was dead the same way. Suffix wildcards are `\p{L}*` for the
 * mirror-image reason: `\w*` stops at the umlaut in "Übernachtungsmöglichkeit"
 * and the trailing boundary then fails mid-word. `parseScope` in
 * `sourceScopeResolver.ts` already uses this idiom.
 *
 * Measured misses that the additions close — all four were phrasings the
 * resolver's own prompt advertises as its job while this gate held them back:
 * "wo kann ich in X übernachten", "wie hoch ist die Pollenbelastung",
 * "was gibt es Neues zu X", "aktuelle Nachrichten aus Y".
 */
export const SYSTEM_MCP_PHRASING =
  /(?<!\p{L})(hotel\p{L}*|unterkun\p{L}*|unterk[üu]nft\p{L}*|[üu]bernacht\p{L}*|absteige|pension|herberge|dienstreise\p{L}*|reiseplan\p{L}*|bahn(?:en|h(?:o|ö)f\p{L}*)?|z(?:ü|ue)ge|zugverbindung\p{L}*|fahrplan\p{L}*|abfahrtszeit\p{L}*|versp[äa]tung\p{L}*|zug\s+nach|verbindung\s+nach|wie\s+komme\s+ich\s+(?:\p{L}+\s+){0,6}?nach|wetter|wettervorhersage|wetterbericht|regnet\s+es|schneit\s+es|pollen\p{L}*|luftqualit[äa]t\p{L}*|tagesschau|schlagzeile\p{L}*|was\s+gibt\s+es\s+neues|aktuelle\s+nachrichten|neuigkeiten)(?!\p{L})/iu;

/**
 * "How do I …?" — an INSTRUCTIONAL question about operating the Grünerator,
 * not a command to do the thing.
 *
 * The `ich` is what makes this safe: a user issuing a command writes "Erstelle
 * ein Sharepic", never "Wie erstelle ich ein Sharepic". Without that distinction
 * the generation heuristics win the turn and the assistant BUILDS a sharepic for
 * someone who only asked how sharepics work.
 *
 * Matched as "wie … ich" within a two-word window rather than an explicit verb
 * list — German separable verbs ("wie lege ich ein Notebook an") make an
 * enumeration endless, and the feature-noun requirement in
 * {@link looksLikeDocsHelpQuestion} is what actually keeps this precise.
 */
export const INSTRUCTIONAL_QUESTION =
  /\bwie\s+(?:\w+\s+){0,2}?ich\b|\bwie\s+(geht\s+das|funktioniert)\b|\bwo\s+(finde|stelle)\s+ich\b/i;

/**
 * An explicit request for documentation, by name.
 */
export const HELP_ANCHOR =
  /\b(anleitung\w*|tutorial\w*|handbuch|dokumentation|doku|hilfeseite\w*|faq|schritt[- ]f[üu]r[- ]schritt)\b/i;

/**
 * Grünerator-specific feature nouns. Required alongside a how-question so
 * generic instructional asks ("wie kann ich die Energiewende erklären") stay
 * out of the docs intent — that is a content question, not a product question.
 */
export const GRUENERATOR_FEATURE_NOUN =
  /\b(gr[üu]nerator\w*|agentura|gr[üu]n[- ]?o[- ]?mat|sharepics?|reels?|untertitel|notebooks?|notizb[üu]ch\w*|wolke|nextcloud|konnektor\w*|mcp[- ]?server\w*|wissenssammlung\w*|monitor|sonntagsfrage|sharepic[- ]studio|composer|grüneratoren)\b/i;

/**
 * Gate for the `hilfe` intent (docs lookup). High precision, deliberately low
 * recall: everything it misses still reaches the LLM tier, and a `hilfe` turn
 * enters the agentic loop where the full tool catalog is mounted — so a false
 * positive is cheap (the model just picks another tool) while a false negative
 * on a generation-shaped question is not (it builds the artifact instead).
 */
export function looksLikeDocsHelpQuestion(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  const hasFeature = GRUENERATOR_FEATURE_NOUN.test(t);
  if (HELP_ANCHOR.test(t) && (hasFeature || INSTRUCTIONAL_QUESTION.test(t))) return true;
  return INSTRUCTIONAL_QUESTION.test(t) && hasFeature;
}

/**
 * Parse JSON response from classifier, with error handling.
 * Handles extended response format with typoAnalysis and contentType.
 */
export function parseClassifierResponse(
  content: string,
  userContent: string
): ClassificationResult {
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

    // The model contradicting itself: it answered "yes, this needs research"
    // and then picked the one intent under which nothing is ever looked up.
    // Loud on purpose — for the field's whole lifetime this was invisible.
    if (parsed.needsResearch === true && parsed.intent === 'direct') {
      log.warn(
        `[Classifier] needsResearch=true but intent=direct — the turn will be forced to call a tool. Reasoning: ${parsed.reasoning}`
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

    // Accept exactly what the prompt offered — `CLASSIFIER_OFFERED_INTENTS` is
    // the same constant that renders the prompt's `"intent"` enum line, so
    // "advertised to the model" and "accepted from the model" can no longer
    // drift apart. Anything else is a hallucination or a router-only
    // disposition (agentic, scrape_url, compare, edit_current_*) and falls
    // through to the regex chain below.
    if (parsed.intent && isOfferedIntent(parsed.intent)) {
      const suffix = extracted ? ' (extracted)' : '';
      const isSearchIntent = !NON_SEARCH_INTENTS.has(parsed.intent);

      // Prefer optimizedSearchQuery for search intents
      const effectiveSearchQuery = isSearchIntent
        ? parsed.optimizedSearchQuery || parsed.searchQuery || userContent
        : null;

      // NO corruption check on the optimized query. There used to be one: it
      // measured how much of the query was word-backed by the LAST MESSAGE and
      // replaced the whole query with `extractSearchTopic(userContent)` below
      // 60%. It cost more than it bought.
      //
      // It could not tell query optimisation from corruption, because both look
      // like "words that aren't in the message":
      //   - A referential follow-up scores 0% BY CONSTRUCTION — its subject
      //     comes from the thread, exactly as the classifier prompt instructs.
      //     Live: "recherchiere über sie im web" was correctly resolved to
      //     "Marilyn Monroe Leben Wirken", scored 0%, was discarded — and the
      //     bare pronoun sentence went to Linkup, which answered with grammar
      //     pages about the word "sie".
      //   - It had already been re-tuned once (recall → precision) after
      //     throwing away a clean 12-word research query for the same reason.
      // What it protected against — the typo pass "correcting" a proper noun it
      // doesn't know ("Stocker" → "Stocher") — is both rarer and milder: a
      // search engine forgives a misspelled name, while a subject-less query
      // retrieves nothing at all. The prompt already forbids typoAnalysis from
      // touching searchQuery (it is logged above), and duplicate/near-duplicate
      // detection downstream absorbs a wasted search.
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

      // Extract search sources for parallel multi-source search. `chat_history`
      // is a first-class SearchSource (past-chat recall) — keep it so the model
      // can explicitly pick it, not only the regex heuristic (detectSearchSources).
      //
      // This list is a silent gate: anything the model names that is absent here
      // is dropped without a log line, so a source the prompt asks for but this
      // list omits can never happen (that is why `examples` is reachable only
      // via detectSearchSources). Typed as SearchSource[] so adding a member to
      // the union surfaces here instead of failing quietly at runtime.
      const validSources: SearchSource[] = ['documents', 'web', 'chat_history', 'bundestag'];
      const searchSources =
        parsed.searchSources?.filter((s): s is SearchSource =>
          validSources.includes(s as SearchSource)
        ) || [];

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

      // Validate documentSubtype like secondaryIntent above. The model invents
      // values outside the prompt's enum ("brief"), and this one is passed
      // downstream as `subtypeOverride`, which wins over the generator's own
      // validated subtype — so an invalid value reaches the INSERT and only the
      // DB check constraint stops it. Dropping it here lets the document
      // generator pick a valid subtype itself.
      let validDocumentSubtype: string | null = null;
      if (typeof parsed.documentSubtype === 'string' && parsed.documentSubtype) {
        if ((CLASSIFIER_DOC_SUBTYPES as readonly string[]).includes(parsed.documentSubtype)) {
          validDocumentSubtype = parsed.documentSubtype;
        } else {
          log.warn(`[Classifier] Invalid documentSubtype "${parsed.documentSubtype}" — dropped`);
        }
      }

      const creationTopic = validateCreationTopic(parsed.creationTopic, parsed.intent, userContent);
      if (creationTopic) {
        log.info(`[Classifier] Creation topic: "${creationTopic}"`);
      }

      const result: ClassificationResult = {
        intent: parsed.intent,
        secondaryIntent: validSecondary,
        searchQuery: effectiveSearchQuery,
        subQueries,
        searchSources,
        filters,
        reasoning: (parsed.reasoning || 'LLM classification') + suffix,
        contentType: parsed.contentType || null,
        needsResearch: parsed.needsResearch === true,
        documentSubtype: validDocumentSubtype,
        targetGroupName: parsed.targetGroupName || null,
        creationTopic,
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
  const intentFieldPattern = (intent: string) =>
    new RegExp(`["']?intent["']?\\s*[:=]\\s*["']?${intent}\\b`, 'i');

  for (const intent of FALLBACK_SCAN_ORDER) {
    if (!intentFieldPattern(intent).test(content)) continue;
    return {
      intent,
      searchQuery: FALLBACK_CARRIES_QUERY.has(intent) ? userContent : null,
      reasoning: `Fallback: ${intent} detected in response`,
    };
  }

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
 * Explicit requests for depth. The umlaut-free spellings are not padding: users
 * type `ausfuehrlich` routinely, and without them an explicit request for detail
 * was silently downgraded — the user asked for more and the answer rule stayed
 * on the middle tier.
 */
const DETAIL_REQUEST_RE =
  /\b(detailliert|ausführlich|ausfuehrlich|umfassend|gründlich|gruendlich|tiefgehend|vollständig|vollstaendig)\b/i;

/**
 * OPEN questions: the answer is a portrait, not a fact. "Wer war X", "Was ist Y",
 * "Erkläre Z" — all short to ask and long to answer.
 *
 * Past tense included deliberately. The old pattern listed only `wer ist`, so
 * every question about a historical person fell through to the length rule.
 */
const OPEN_LOOKUP_RE =
  /^(wer|was)\s+(ist|war|sind|waren)\b|^(erkläre|erklär|erklaere|erzähl|erzaehl|beschreib)/i;

/** CLOSED lookups: a place or a date is one fact, however it is phrased. */
const CLOSED_LOOKUP_RE = /^(wo\s+(ist|liegt|war)|wann)\b/i;

/**
 * Detect query complexity using heuristic patterns.
 * Determines whether a query needs simple, moderate, or complex research depth.
 *
 * The ordering below is the substance of this function, not housekeeping.
 *
 * A length shortcut (`q.length < 30 → simple`) used to run FIRST, which made the
 * question's length a proxy for the answer's scope — and the two are close to
 * inverted. "wer war marilyn monroe" is 22 characters; it produced a two-sentence
 * answer that named her birth date and nothing else, while the same question
 * with "ausführlich" appended produced four sections including her films. The
 * cap was doing that, not the model and not the sources.
 *
 * It also made the pattern list below unreachable for exactly the queries it
 * described: every `was ist X` short enough to match it had already returned.
 *
 * So openers are classified by whether the QUESTION is open or closed, before
 * length is consulted at all. Length survives only as the last resort, for input
 * that matches no shape — a bare topic word ("Klimaschutz").
 *
 * Consumers other than the answer-format rule: `briefGeneratorNode` and
 * `intentExecutionService` group `moderate` with `complex`, so an open lookup
 * that also carries `intent === 'research'` now plans before it searches. That
 * is the intended reading — an open research question deserves a plan.
 * `searchDepth.ts` deliberately stopped taking `complexity` as a parameter, so
 * nothing here can buy the expensive engine tier.
 */
export function detectComplexity(query: string): 'simple' | 'moderate' | 'complex' {
  const q = query.toLowerCase();
  const trimmed = q.trim();

  // Complex: comparison, multi-topic, or explicit detail requests
  if (
    /\b(vergleich|unterschied|pro\s+und\s+contra|gegenüber|im\s+vergleich|versus|vs\.?)\b/i.test(q)
  ) {
    return 'complex';
  }
  if (DETAIL_REQUEST_RE.test(q)) {
    return 'complex';
  }
  // Multi-clause: "und" connecting distinct topics (not just filler)
  if (/\b(einerseits|andererseits|sowohl|als\s+auch)\b/i.test(q)) {
    return 'complex';
  }

  // Greetings are genuinely closed, at any length.
  if (/^(hallo|hi|hey|guten|servus|moin|danke)/i.test(trimmed)) {
    return 'simple';
  }

  // Shape before length — this is the fix.
  if (OPEN_LOOKUP_RE.test(trimmed)) {
    return 'moderate';
  }
  if (CLOSED_LOOKUP_RE.test(trimmed)) {
    return 'simple';
  }

  // Last resort: no recognisable shape. A bare topic word is a simple ask.
  if (q.length < 30) {
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

  // Parliamentary process named alongside party content → collections + DIP.
  // Deliberately narrow: only wording that points at the parliamentary RECORD
  // (Drucksache, Plenardebatte, Gesetzgebungsverfahren), not the mere word
  // "Bundestag" — "was sagen die Grünen im Bundestag zum Klimaschutz" is a
  // question about positions, and pairing it with DIP would spend a second
  // retrieval round on documents nobody asked for. `bundestagsfraktion` is
  // excluded for the same reason: it names our own collection, not the DIP.
  // Suffixes are `\w*`, not `\b`, because German inflects: "der Stand des
  // GesetzentwurfS", "in den DrucksachEN". A word-boundary-only pattern matched
  // the nominative and quietly missed every declined form.
  const parliamentaryKeywords =
    /\b(drucksache\w*|drs\.?|plenar\w*|plenum|gesetzentw(urf|ürf)\w*|gesetzgebungsverfahren\w*|bundestagsdebatte\w*|debattiert|kleine anfrage\w*|große anfrage\w*|abgestimmt|beratungsstand\w*|antrag im bundestag|im bundestag (debattiert|beschlossen|eingebracht|beraten))\b/i;
  if (hasPartyKeywords && parliamentaryKeywords.test(q)) {
    return ['documents', 'bundestag'];
  }

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

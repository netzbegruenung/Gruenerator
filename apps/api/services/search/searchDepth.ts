/**
 * The chat's three retrieval tiers — the single place that decides how much a
 * question is worth, and the only place that maps a tier onto a Linkup engine
 * depth.
 *
 * History, because the ladder has been wrong twice in opposite directions:
 *
 * 1. There were two doors instead of tiers: `web_search` (Linkup
 *    `depth: standard`) and a separate `research` tool that always ran
 *    `depth: deep` + `outputType: sourcedAnswer`. The word "recherchiere" alone
 *    took the second door. Cheap mode, expensive mode, nothing in between.
 * 2. The three-tier ladder that replaced it put `gruendlich` on `depth: deep`
 *    and handed it out for `complexity === 'complex'` — a value
 *    `detectComplexity` returns for any "vergleich / ausführlich / gründlich" in
 *    the text. So the most expensive engine setting became the default for
 *    ordinary comparison questions that nobody asked to research.
 *
 * The fix is to stop treating tier and engine depth as the same axis. Linkup has
 * THREE depths (`fast` <1s keyword-only, `standard` 1–3s single-iteration
 * agentic, `deep` 5–30s multi-iteration), and it fans out across adjacent
 * keywords on `standard` when the query asks it to. So breadth is buyable
 * without buying depth:
 *
 *   standard        → depth standard,  5 sources                (the normal case)
 *   gruendlich      → depth standard, 10 sources + adjacent fan-out
 *   tiefenrecherche → depth deep,     20 sources + adjacent fan-out
 *
 * Only `tiefenrecherche` spends the expensive engine, and only an explicit ask
 * reaches it. Complexity heuristics buy nothing at all any more.
 */
import { type LinkupDepth } from './LinkupService.js';

/** F1 — these ids reach the model in the `web_search` tool schema and are
 *  persisted in tool-call arguments. Add tiers, don't rename them. */
export const SEARCH_TIERS = ['standard', 'gruendlich', 'tiefenrecherche'] as const;

export type SearchTier = (typeof SEARCH_TIERS)[number];

interface TierConfig {
  depth: LinkupDepth;
  maxResults: number;
  /**
   * Ask Linkup to run several searches across adjacent keywords inside the one
   * paid call. This replaces our own `expandQuery` fan-out on the web path,
   * which bought breadth by paying for 2–3 calls where the engine offers it
   * inside one. Never combined with `fast` — see `resolveSearchPlan`.
   */
  adjacentSearches: boolean;
  /** Shown to the user while the search runs. */
  progress: string;
}

const TIER_CONFIG: Readonly<Record<SearchTier, TierConfig>> = {
  standard: {
    depth: 'standard',
    maxResults: 5,
    adjacentSearches: false,
    progress: 'Suche im Web…',
  },
  gruendlich: {
    depth: 'standard',
    maxResults: 10,
    adjacentSearches: true,
    progress: 'Gründliche Suche läuft (mehrere Quellen)…',
  },
  tiefenrecherche: {
    depth: 'deep',
    maxResults: 20,
    adjacentSearches: true,
    progress: 'Tiefenrecherche läuft (viele Quellen, dauert ca. 15–20s)…',
  },
};

export function resolveTier(tier: SearchTier | undefined): TierConfig {
  return TIER_CONFIG[tier ?? 'standard'];
}

/**
 * Whether a query may take Linkup's `fast` depth, and on which grounds.
 *
 * `fast` passes the query string to the index verbatim: no interpretation, no
 * reformulation, no sub-searches, no scraping, no LLM. That is exactly right when
 * the answer is ONE datum sitting in the index — "wann ist Marilyn Monroe
 * geboren", "Einwohnerzahl Kassel" — and answers in under a second. It is wrong
 * whenever the query needs interpreting, because then its own words become search
 * terms: `fast` would look up "vergleiche", "position", "von".
 *
 * Two grounds, both requiring a SHORT query with no instruction verb and no
 * multi-part conjunction:
 *   - `keywords`    — no interrogative at all, just the terms.
 *   - `single-fact` — a question, but one asking for a single value (wann/wer/wo/
 *                     wie viele/wie hoch …). The stopwords it carries are noise a
 *                     keyword index absorbs; the content words still dominate.
 *
 * Explanatory questions are excluded on purpose. "warum", "wieso", "wie
 * funktioniert", "was bedeutet" want a synthesis across sources, which is the one
 * thing this depth cannot do — and the failure would look like a thin answer, not
 * like a wrong setting.
 */
export type FastLookupShape = 'keywords' | 'single-fact' | null;

/** Interrogatives whose answer is a single value. */
const SINGLE_FACT_OPENER =
  /^(wann|seit\s+wann|bis\s+wann|wer|wo|woher|wohin|wie\s+(?:viel\w*|hoch|alt|groß|gross|lang\w*|weit|schwer|teuer|oft|spät|frueh|früh)|was\s+kostet|welches\s+jahr|in\s+welchem\s+jahr)\b/i;

/** Any interrogative — used to tell "keywords" from "a question". */
const QUESTION_WORDS =
  /^(was|wer|wie|wo|wann|warum|wieso|weshalb|welche[rsnm]?|wem|wen|woher|wohin|ist|sind|war|waren|hat|haben|kann|können|gibt|soll|sollte|darf|muss|würde|wird|werden|seit|bis|in)\b/i;

const INSTRUCTION_VERBS =
  /\b(recherchier\w*|vergleich\w*|erklär\w*|erklar\w*|fasse|zusammenfass\w*|analysier\w*|prüf\w*|pruef\w*|bewert\w*|beschreib\w*|nenn\w*|liste|zeig\w*|erstell\w*|schreib\w*|ermittel\w*|untersuch\w*|bitte|funktionier\w*|bedeutet)\b/i;

/** Two topics in one query — `fast` has no way to split them. */
const MULTI_PART =
  /\b(und|oder|sowie|versus|vs\.?|gegenüber|einerseits|andererseits|sowohl|au(?:ß|ss)erdem)\b/i;

/** A bare lookup is at most this long; a single-fact question may be longer
 *  because the interrogative and its auxiliaries cost tokens without adding
 *  topics ("wann ist Marilyn Monroe geboren" = 6). */
const KEYWORD_MAX_TOKENS = 5;
const SINGLE_FACT_MAX_TOKENS = 8;

export function fastLookupShape(query: string): FastLookupShape {
  const trimmed = query.trim();
  if (trimmed.length === 0) return null;
  // A URL is a scrape instruction, and `fast` cannot scrape at all.
  if (/https?:\/\//i.test(trimmed)) return null;
  if (INSTRUCTION_VERBS.test(trimmed)) return null;
  if (MULTI_PART.test(trimmed)) return null;

  const tokenCount = trimmed.split(/\s+/).length;
  if (SINGLE_FACT_OPENER.test(trimmed)) {
    return tokenCount <= SINGLE_FACT_MAX_TOKENS ? 'single-fact' : null;
  }
  if (QUESTION_WORDS.test(trimmed)) return null;
  return tokenCount <= KEYWORD_MAX_TOKENS ? 'keywords' : null;
}

/** True when the query is a bare term lookup or a single-fact question. */
export function isKeywordShapedQuery(query: string): boolean {
  return fastLookupShape(query) !== null;
}

export interface SearchPlan {
  tier: SearchTier;
  depth: LinkupDepth;
  maxResults: number;
  adjacentSearches: boolean;
  progress: string;
  /** Why `fast` was chosen, for the log line. Null when it wasn't. */
  fastReason: FastLookupShape;
}

/**
 * Resolve tier + query into the complete engine setting for one call.
 *
 * One function rather than a `resolveTier` the caller combines by hand, because
 * two of the fields must not be chosen independently: the adjacent-keyword
 * instruction is prose appended to the query, and `fast` treats prose as search
 * terms. Returning them together makes "fast + instruction" unrepresentable.
 */
export function resolveSearchPlan(params: {
  tier?: SearchTier;
  query?: string;
  /** Explicit override (news widgets, compound turns); tier supplies the default. */
  maxResults?: number;
}): SearchPlan {
  const tier = params.tier ?? 'standard';
  const config = resolveTier(tier);
  const eligible = config.depth === 'standard' && !config.adjacentSearches;
  const fastReason = eligible && params.query != null ? fastLookupShape(params.query) : null;

  return {
    tier,
    depth: fastReason ? 'fast' : config.depth,
    maxResults: params.maxResults ?? config.maxResults,
    adjacentSearches: fastReason ? false : config.adjacentSearches,
    progress: config.progress,
    fastReason,
  };
}

/**
 * The single tier decision, shared by both deciders: the classifier path (which
 * has an intent) and the agentic loop (where the model names a tier in the
 * `web_search` tool call).
 *
 * `explicitDeep` is the only route to `tiefenrecherche`. A tier the model asked
 * for is a REQUEST, not authority — left unclamped, a model that reads "nutze
 * sie sparsam" as a suggestion spends the deep engine on whatever it likes, and
 * the classifier path had the same hole through a complexity heuristic.
 *
 * `complexity` is deliberately not a parameter any more. It used to buy a step,
 * and since `detectComplexity` returns `complex` for any "vergleich" or
 * "ausführlich" in the text, that step was handed out constantly — which is the
 * failure this module exists to prevent, in its second incarnation.
 */
export function resolveSearchTier(params: {
  intent: string;
  /** Tier named by the model in the tool call, if any. */
  requestedTier?: SearchTier | null;
  /** The user asked for a deep/thorough research in so many words. */
  explicitDeep?: boolean;
}): SearchTier {
  const wanted: SearchTier =
    params.requestedTier ?? (params.intent === 'research' ? 'gruendlich' : 'standard');
  if (wanted === 'tiefenrecherche' && !params.explicitDeep) return 'gruendlich';
  return wanted;
}

/**
 * Did the user ask for a deep research in so many words?
 *
 * Deterministic on purpose: it gates the only expensive engine setting, so it
 * must be inspectable and testable without a model in the loop. The bar is a
 * research verb PLUS a thoroughness marker (or the compound word itself) —
 * "recherchiere das mal" is an ordinary research turn, "recherchiere das
 * gründlich" is a request for the deep engine.
 */
const DEEP_COMPOUND = /\b(tiefenrecherche|tiefen-recherche|deep\s?research|dossier)\b/i;
const RESEARCH_VERB = /\b(recherchier\w*|recherche|untersuch\w*|nachforsch\w*)\b/i;
const THOROUGHNESS =
  /\b(gründlich\w*|gruendlich\w*|ausführlich\w*|ausfuehrlich\w*|umfassend\w*|tiefgehend\w*|tiefgründig\w*|detailliert\w*|erschöpfend\w*|so\s+genau\s+wie\s+möglich)\b/i;

export function isExplicitDeepRequest(text: string | null | undefined): boolean {
  if (!text) return false;
  if (DEEP_COMPOUND.test(text)) return true;
  return RESEARCH_VERB.test(text) && THOROUGHNESS.test(text);
}

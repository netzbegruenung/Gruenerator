/**
 * The chat's three retrieval tiers — the single place that decides how much a
 * question is worth.
 *
 * There used to be two doors instead of three tiers: `web_search` (Linkup
 * `depth: standard`) and a separate `research` tool/intent that always ran
 * Linkup `depth: deep` with `outputType: sourcedAnswer`. Anything the word
 * "recherchiere" touched went through the second door, and the depth the
 * classifier computed for it (`simple → quick`, `complex → thorough`) was
 * discarded unread — `executeResearch` short-circuited into the Linkup branch
 * before it was ever consulted. So the system had a cheap mode and an expensive
 * mode and no way to pick the middle.
 *
 * Linkup gives exactly two engine depths. The third tier is therefore breadth,
 * not a third engine: `tiefenrecherche` is `deep` over twice the sources. That
 * is honest about what the API offers — the win is that `gruendlich` exists at
 * all, not that `tiefenrecherche` got stronger.
 */
import { type LinkupDepth } from './LinkupService.js';

/** F1 — these ids reach the model in the `web_search` tool schema and are
 *  persisted in tool-call arguments. Add tiers, don't rename them. */
export const SEARCH_TIERS = ['standard', 'gruendlich', 'tiefenrecherche'] as const;

export type SearchTier = (typeof SEARCH_TIERS)[number];

interface TierConfig {
  depth: LinkupDepth;
  maxResults: number;
  /** Shown to the user while the search runs. */
  progress: string;
}

const TIER_CONFIG: Readonly<Record<SearchTier, TierConfig>> = {
  standard: {
    depth: 'standard',
    maxResults: 5,
    progress: 'Suche im Web…',
  },
  gruendlich: {
    depth: 'deep',
    maxResults: 10,
    progress: 'Gründliche Suche läuft (mehrere Quellen)…',
  },
  tiefenrecherche: {
    depth: 'deep',
    maxResults: 20,
    progress: 'Tiefenrecherche läuft (viele Quellen, dauert ca. 15–20s)…',
  },
};

export function resolveTier(tier: SearchTier | undefined): TierConfig {
  return TIER_CONFIG[tier ?? 'standard'];
}

/**
 * Single-pass tier from the classifier's own signals.
 *
 * Two independent one-step upgrades, and only both together reach the top:
 * the explicit ask ("recherchiere") buys one level, `detectComplexity`
 * returning `complex` buys the other.
 *
 * `moderate` deliberately buys NOTHING. It is `detectComplexity`'s fallback —
 * the value it returns when no rule matched, i.e. "unknown", not "medium". Any
 * mapping that upgrades on it would silently make the ordinary web search the
 * expensive one, which is the failure this whole change exists to end.
 */
export function tierFromClassification(params: {
  intent: string;
  complexity?: 'simple' | 'moderate' | 'complex' | null;
}): SearchTier {
  const askedForResearch = params.intent === 'research';
  const looksBroad = params.complexity === 'complex';
  if (askedForResearch && looksBroad) return 'tiefenrecherche';
  if (askedForResearch || looksBroad) return 'gruendlich';
  return 'standard';
}

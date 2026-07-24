/**
 * Per-turn guard state for an agentic tool loop. Pure and dependency-light so
 * it unit-tests without the AI SDK / DB.
 *
 * Guards (all return a German error string the model sees and self-corrects
 * on, instead of the tool executing):
 *   - duplicate-call detection — turn-wide with query normalization by
 *     default (LobeHub/OpenWebUI have nothing comparable; both rely on the
 *     iteration cap alone, which live testing showed models burn on
 *     re-phrased repeats of the same search). `duplicateScope: 'consecutive'`
 *     preserves the original exact-previous-call semantics for the sharepic
 *     edit loop.
 *   - per-tool failure cap + total failure budget (proven in the sharepic loop
 *     / borrowed from LobeHub).
 *   - search budget — once enough search-family calls ran or enough sources
 *     accumulated, further searches are refused so the model answers instead
 *     of gathering on stock.
 *   - internal-first — web search / scraping is refused until the internal
 *     document search ran at least once (structural enforcement of the
 *     "erst interne Dokumente" policy the prompt alone failed to deliver).
 */

export const MAX_FAILURES_PER_TOOL = 2;
export const MAX_TOTAL_FAILURES = 5;
// Raised for multi-topic questions: a "compare A, B, C, D" turn legitimately
// needs one search per topic. Redundancy is stopped by the Jaccard near-dup
// guard (sameness), NOT by a low call ceiling (volume).
export const MAX_SEARCH_CALLS = 6;
// Kept only as a far context-safety ceiling, NOT an early "stop searching"
// signal — the old low value (6) starved multi-topic turns after one topic.
export const MAX_SOURCES = 20;
// Token-overlap at/above which two same-tool searches count as the same query.
export const NEAR_DUPLICATE_JACCARD = 0.6;

export interface InternalFirstPolicy {
  /** Tool that must have run at least once before gated tools are allowed. */
  requiredTool: string;
  gatedTools: ReadonlySet<string>;
  /** True disables the policy for this turn (explicit web intent, user-pasted URL). */
  exempt: boolean;
  /** Once the internal search has yielded at least this many sources, the web/
   *  scrape tools are refused — internal is PREFERRED, not merely FIRST. The web
   *  stays available only when internal came up short (or empty). Default 3. */
  minSourcesToSkipWeb?: number;
}

export const MIN_INTERNAL_SOURCES_TO_SKIP_WEB = 3;

export interface ToolLoopGuardOptions {
  maxFailuresPerTool?: number;
  maxTotalFailures?: number;
  /** 'turn' (default) rejects any normalized repeat this turn; 'consecutive'
   *  only an exactly-repeated immediately-previous call. */
  duplicateScope?: 'consecutive' | 'turn';
  /** Tools counted against the search budget. */
  searchToolNames?: ReadonlySet<string>;
  maxSearchCalls?: number;
  maxSources?: number;
  /** Live source count (sourceRegistry.size) — a context-safety ceiling only. */
  getSourceCount?: () => number;
  /** Jaccard overlap ≥ this on a same-tool query = a near-duplicate (turn scope
   *  only). 0 disables. */
  nearDuplicateJaccard?: number;
  internalFirst?: InternalFirstPolicy;
}

export interface ToolLoopGuards {
  /** Rejects a repeated call — turn-wide normalized by default. Pass
   *  `skipNearDuplicate` for structured-arg tools (MCP connectors) that must not
   *  be blocked by the search-tuned Jaccard/subset heuristic. */
  checkDuplicate(
    toolName: string,
    input: unknown,
    opts?: { skipNearDuplicate?: boolean }
  ): string | null;
  noteFailure(toolName: string): void;
  /** Non-null once a single tool has failed `maxFailuresPerTool` times. */
  checkFailureCap(toolName: string): string | null;
  /** Non-null once total failures across all tools hit `maxTotalFailures`. */
  checkTotalFailureBudget(): string | null;
  /** Non-null once the search budget (call count or source count) is spent. */
  checkSearchBudget(toolName: string): string | null;
  /** Non-null when a web/scrape tool is called before the internal search. */
  checkInternalFirst(toolName: string): string | null;
  /** Records an executed call (after all guards passed). */
  noteCall(toolName: string): void;
  /** Records that a call finished (result available). Lets checkInternalFirst
   *  tell an in-flight internal search from a completed-but-empty one. */
  noteCompletion(toolName: string): void;
  /** Records a model turn that produced neither text nor a tool call; returns the running count. */
  noteEmptyCompletion(): number;
  readonly emptyCompletions: number;
}

/** Normalizes string values so re-phrasings of the same query collide:
 *  lowercased, punctuation stripped, whitespace collapsed, tokens sorted. */
function normalizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(' ');
  }
  if (Array.isArray(value)) {
    // Sort so re-ordered lists (e.g. the same URLs shuffled) collide.
    return value
      .map(normalizeValue)
      .sort((a, b) => (JSON.stringify(a) ?? '').localeCompare(JSON.stringify(b) ?? ''));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalizeValue(v)])
    );
  }
  return value;
}

/** All word tokens from every string value in the input (lowercased, punctuation
 *  stripped), for near-duplicate (Jaccard) comparison. */
function inputTokens(value: unknown, acc: Set<string> = new Set()): Set<string> {
  if (typeof value === 'string') {
    for (const t of value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)) {
      if (t) acc.add(t);
    }
  } else if (Array.isArray(value)) {
    for (const v of value) inputTokens(v, acc);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) inputTokens(v, acc);
  }
  return acc;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/** True when the smaller token set (≥2 tokens) is fully contained in the larger
 *  — a pure narrowing/widening of the same query ("Balkonkraftwerke 2024 Anzahl
 *  Deutschland" ⊂ "Anzahl Balkonkraftwerke Deutschland 2023 2024", or
 *  "Vermögensteuer Grüne" ⊂ "Vermögensteuer Grüne Abschaffung"), i.e. a
 *  redundant re-search Jaccard misses. The ≥2 floor keeps distinct single-topic
 *  queries that merely share one word (Atomkraft vs Tempolimit) out. */
function isTokenSubset(a: Set<string>, b: Set<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size < 2) return false;
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

/** Human-readable form of a tool input for the duplicate error message. */
function describeInput(input: unknown): string {
  if (input && typeof input === 'object') {
    const r = input as Record<string, unknown>;
    if (typeof r.query === 'string') return r.query;
    if (typeof r.url === 'string') return r.url;
    if (Array.isArray(r.urls)) return r.urls.join(', ');
  }
  return JSON.stringify(input ?? {});
}

export function createToolLoopGuards(options: ToolLoopGuardOptions = {}): ToolLoopGuards {
  const maxPerTool = options.maxFailuresPerTool ?? MAX_FAILURES_PER_TOOL;
  const maxTotal = options.maxTotalFailures ?? MAX_TOTAL_FAILURES;
  const duplicateScope = options.duplicateScope ?? 'turn';
  const searchToolNames = options.searchToolNames ?? new Set<string>();
  const maxSearchCalls = options.maxSearchCalls ?? MAX_SEARCH_CALLS;
  const maxSources = options.maxSources ?? MAX_SOURCES;
  const nearDuplicateJaccard =
    duplicateScope === 'turn' ? (options.nearDuplicateJaccard ?? NEAR_DUPLICATE_JACCARD) : 0;

  let lastKey = '';
  const seenKeys = new Set<string>();
  /** toolName → original (un-normalized) input descriptions, for error messages. */
  const priorInputs = new Map<string, string[]>();
  /** toolName → token sets of prior queries, for near-duplicate detection. */
  const priorTokens = new Map<string, Set<string>[]>();
  const callCounts = new Map<string, number>();
  const completedCounts = new Map<string, number>();
  let searchCalls = 0;
  const failures = new Map<string, number>();
  let totalFailures = 0;
  let emptyCompletions = 0;

  return {
    checkDuplicate(toolName, input, opts) {
      const skipNearDuplicate = opts?.skipNearDuplicate ?? false;
      // 'consecutive' keeps the original exact-match semantics (sharepic edit
      // loop); 'turn' normalizes so re-phrasings of the same query collide.
      const key =
        duplicateScope === 'turn'
          ? `${toolName}:${JSON.stringify(normalizeValue(input))}`
          : `${toolName}:${JSON.stringify(input)}`;
      const isRepeat = duplicateScope === 'turn' ? seenKeys.has(key) : key === lastKey;
      if (isRepeat) {
        const prior = priorInputs.get(toolName) ?? [];
        return duplicateScope === 'turn'
          ? `Diese Suche lief schon (bereits mit ${toolName}: ${prior.join(' | ')}). Formuliere eine WIRKLICH ANDERE Suche oder antworte jetzt mit den vorhandenen Ergebnissen.`
          : 'Identischer Aufruf wiederholt — ändere die Parameter oder antworte dem*der Nutzer*in direkt.';
      }

      // Near-duplicate (turn scope): a re-phrasing that shares ≥ threshold tokens
      // with a prior same-tool search. Catches "Atomkraft Position Grüne" vs
      // "Position Atomkraft" that the exact-key check above misses.
      //
      // SKIPPED for MCP connector tools (`skipNearDuplicate`): this Jaccard/subset
      // heuristic is tuned for natural-language search queries. Connectors take
      // STRUCTURED args (`{location, checkin}`, `{subject}`) where legitimately
      // different calls share most tokens, and a corrective retry after a
      // validation error (e.g. Sally "subject must be ≥3 chars" → retry with a
      // real subject) reads as "too similar" and gets wrongly blocked. Connectors
      // keep only the exact-normalized-duplicate guard above.
      const tokens = inputTokens(input);
      if (!skipNearDuplicate && nearDuplicateJaccard > 0 && tokens.size > 0) {
        const priorSets = priorTokens.get(toolName) ?? [];
        if (
          priorSets.some(
            (p) => jaccard(tokens, p) >= nearDuplicateJaccard || isTokenSubset(tokens, p)
          )
        ) {
          const prior = priorInputs.get(toolName) ?? [];
          return `Zu ähnlich zu einer bereits gelaufenen Suche (${prior.join(' | ')}). Wechsle das THEMA oder antworte jetzt mit den vorhandenen Ergebnissen.`;
        }
      }

      lastKey = key;
      seenKeys.add(key);
      const prior = priorInputs.get(toolName) ?? [];
      prior.push(describeInput(input));
      priorInputs.set(toolName, prior);
      const sets = priorTokens.get(toolName) ?? [];
      sets.push(tokens);
      priorTokens.set(toolName, sets);
      return null;
    },
    noteFailure(toolName) {
      failures.set(toolName, (failures.get(toolName) ?? 0) + 1);
      totalFailures += 1;
    },
    checkFailureCap(toolName) {
      if ((failures.get(toolName) ?? 0) >= maxPerTool) {
        return 'Zu viele Fehlversuche mit diesem Tool — erkläre dem*der Nutzer*in, was nicht geklappt hat.';
      }
      return null;
    },
    checkTotalFailureBudget() {
      if (totalFailures >= maxTotal) {
        return 'Zu viele fehlgeschlagene Tool-Aufrufe insgesamt — beantworte die Anfrage jetzt mit dem, was du bereits weißt.';
      }
      return null;
    },
    checkSearchBudget(toolName) {
      if (!searchToolNames.has(toolName)) return null;
      // Call count is the real ceiling (allows one search per topic in a
      // multi-topic turn). Source count is only a far context-safety cap — NOT
      // an early stop, or two rich searches on topic 1 would starve topics 2-N.
      const sourceCount = options.getSourceCount?.() ?? 0;
      if (searchCalls >= maxSearchCalls || sourceCount >= maxSources) {
        return 'Du hast bereits ausführlich gesucht — führe KEINE weitere Suche aus und beantworte die Frage jetzt mit den vorhandenen Quellen.';
      }
      return null;
    },
    checkInternalFirst(toolName) {
      const policy = options.internalFirst;
      if (!policy || policy.exempt || !policy.gatedTools.has(toolName)) return null;
      const internalCalls = callCounts.get(policy.requiredTool) ?? 0;
      if (internalCalls === 0) {
        return `Nutze zuerst ${policy.requiredTool} (interne Dokumente), bevor du das Web durchsuchst.`;
      }
      // In-flight guard: an internal search was CALLED but hasn't COMPLETED yet
      // (noteCall bumps at call start, results register only after execute). When
      // internal + web fire in the SAME step, web would otherwise slip through
      // this window. Hold web until the internal call lands — but only while it's
      // genuinely in flight, so a completed-but-EMPTY internal search still lets
      // the model fall to the web (the whole point of internal-FIRST).
      const internalCompleted = completedCounts.get(policy.requiredTool) ?? 0;
      if (internalCalls > internalCompleted) {
        return `Warte auf die Ergebnisse von ${policy.requiredTool}, bevor du das Web durchsuchst.`;
      }
      // Internal-PREFERRED: if the internal search already yielded enough, don't
      // web-search / scrape on top of it. Only fall to the web when internal
      // came up short (or empty). Also blocks model-invented scrape URLs.
      const minSources = policy.minSourcesToSkipWeb ?? MIN_INTERNAL_SOURCES_TO_SKIP_WEB;
      if ((options.getSourceCount?.() ?? 0) >= minSources) {
        return 'Du hast bereits genügend interne Dokumente gefunden — beantworte die Frage damit. Nutze die Websuche/Scraping NUR, wenn intern nichts Passendes zu finden war (oder es klar um tagesaktuelle Ereignisse geht).';
      }
      return null;
    },
    noteCall(toolName) {
      callCounts.set(toolName, (callCounts.get(toolName) ?? 0) + 1);
      if (searchToolNames.has(toolName)) searchCalls += 1;
    },
    noteCompletion(toolName) {
      completedCounts.set(toolName, (completedCounts.get(toolName) ?? 0) + 1);
    },
    noteEmptyCompletion() {
      emptyCompletions += 1;
      return emptyCompletions;
    },
    get emptyCompletions() {
      return emptyCompletions;
    },
  };
}

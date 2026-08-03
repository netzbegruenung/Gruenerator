/**
 * Per-turn guard state for an agentic tool loop. Pure and dependency-light so
 * it unit-tests without the AI SDK / DB.
 *
 * Guards (all return a {@link GuardBlock} whose `modelMessage` the model sees
 * and self-corrects on, instead of the tool executing):
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
 *   - search concurrency — at most `maxConcurrentSearches` search-family calls
 *     may be in flight at once. The surplus is DEFERRED, not failed: the model
 *     is told to read the running results first, so its next query is chosen
 *     with evidence in hand instead of guessed alongside it.
 */

/** Which guard refused a call. Backend logs and tests only — never user-facing. */
export type GuardName =
  | 'duplicate'
  | 'near_duplicate'
  | 'failure_cap'
  | 'failure_budget'
  | 'search_budget'
  | 'search_concurrency';

/**
 * A guard's refusal of one tool call.
 *
 * `modelMessage` is STEERING TEXT addressed to the planner ("Nutze zuerst X",
 * "Formuliere eine andere Suche") — an instruction, not a status report. It must
 * never be rendered to the user: as a red tool-card error it claims the
 * assistant tried something and it failed, about a call that never ran. Live
 * example: "wer war marilyn monroe?" showed a Websuche card with
 * "Nutze zuerst gruenerator_search (interne Dokumente)" underneath it.
 *
 * Callers therefore hand `modelMessage` to the MODEL as the tool result and log
 * it; the user-facing signal is the answer the model produces afterwards. The
 * separate type exists so this cannot be forgotten at a call site: a
 * `GuardBlock` does not fit anywhere a tool result is expected without being
 * unwrapped deliberately.
 */
export interface GuardBlock {
  guard: GuardName;
  /**
   * `reject` — the call must not run as issued; the model has to change course.
   * `defer`  — the IDENTICAL call is expected back in a later step, so the guard
   *            left no trace of it (no counter, no duplicate key) and the caller
   *            must not leave one either.
   */
  kind: 'reject' | 'defer';
  /** German steering text handed to the model as this call's tool result. */
  modelMessage: string;
}

/** `null` = the call may proceed. */
export type GuardVerdict = GuardBlock | null;

const reject = (guard: GuardName, modelMessage: string): GuardBlock => ({
  guard,
  kind: 'reject',
  modelMessage,
});

const defer = (guard: GuardName, modelMessage: string): GuardBlock => ({
  guard,
  kind: 'defer',
  modelMessage,
});

export const MAX_FAILURES_PER_TOOL = 2;
export const MAX_TOTAL_FAILURES = 5;
/**
 * How many search-family calls may run at the same time.
 *
 * The AI SDK executes every tool call of one model step concurrently, so a model
 * that emits four searches in a step gets four paid calls and no chance to
 * reconsider between them — the fourth query was written before the first result
 * existed. Two keeps the obvious parallelism (a comparison's two halves) and
 * makes everything beyond that sequential and therefore informed.
 *
 * Not enforced via the providers' `parallelToolCalls: false` (available on
 * @ai-sdk/mistral and @ai-sdk/openai): that would cap the step at ONE tool call
 * for every tool, not two for searches.
 */
export const MAX_CONCURRENT_SEARCHES = 2;
// Raised for multi-topic questions: a "compare A, B, C, D" turn legitimately
// needs one search per topic. Redundancy is stopped by the Jaccard near-dup
// guard (sameness), NOT by a low call ceiling (volume).
export const MAX_SEARCH_CALLS = 6;
// Kept only as a far context-safety ceiling, NOT an early "stop searching"
// signal — the old low value (6) starved multi-topic turns after one topic.
export const MAX_SOURCES = 20;
// Token-overlap at/above which two same-tool searches count as the same query.
export const NEAR_DUPLICATE_JACCARD = 0.6;

/**
 * What to do when the internal document search comes back EMPTY.
 *
 * This is all that is left of the former "internal-first" policy, which also
 * BLOCKED `web_search`/`scrape_url` until the party-document search had run, and
 * again once that search had yielded enough. The block is gone: it could not
 * tell a party question from a general one, so "wer war marilyn monroe?" was
 * refused the web and answered from model memory — hallucinated film title, not
 * one source. Which retrieval a question needs is the classifier's call, made
 * with the whole message and the thread in hand; a per-tool counter inside the
 * loop cannot second-guess it. The preference for party documents on party
 * questions stays where it works: in the tool descriptions and the planner
 * prompt, which name the topic ("für grüne Positionen, Programme, Beschlüsse").
 *
 * What remains is not a block — it only ever ADDS a search.
 */
export interface InternalFallbackPolicy {
  /** The internal document search whose empty result triggers the fallback. */
  requiredTool: string;
  /** Which tool to FORCE when the internal search completed with nothing. The
   *  caller names it (and only when it is actually mounted) so this module keeps
   *  no tool-catalog knowledge. */
  fallbackTool: string;
}

export interface ToolLoopGuardOptions {
  maxFailuresPerTool?: number;
  maxTotalFailures?: number;
  /** 'turn' (default) rejects any normalized repeat this turn; 'consecutive'
   *  only an exactly-repeated immediately-previous call. */
  duplicateScope?: 'consecutive' | 'turn';
  /** Tools counted against the search budget. */
  searchToolNames?: ReadonlySet<string>;
  maxSearchCalls?: number;
  /** In-flight ceiling for search-family calls. Default MAX_CONCURRENT_SEARCHES. */
  maxConcurrentSearches?: number;
  maxSources?: number;
  /** Live source count (sourceRegistry.size) — a context-safety ceiling only. */
  getSourceCount?: () => number;
  /** Jaccard overlap ≥ this on a same-tool query = a near-duplicate (turn scope
   *  only). 0 disables. */
  nearDuplicateJaccard?: number;
  internalFallback?: InternalFallbackPolicy;
}

export interface ToolLoopGuards {
  /** Rejects a repeated call — turn-wide normalized by default. Pass
   *  `skipNearDuplicate` for structured-arg tools (MCP connectors) that must not
   *  be blocked by the search-tuned Jaccard/subset heuristic. */
  checkDuplicate(
    toolName: string,
    input: unknown,
    opts?: { skipNearDuplicate?: boolean }
  ): GuardVerdict;
  noteFailure(toolName: string): void;
  /** Non-null once a single tool has failed `maxFailuresPerTool` times. */
  checkFailureCap(toolName: string): GuardVerdict;
  /** Non-null once total failures across all tools hit `maxTotalFailures`. */
  checkTotalFailureBudget(): GuardVerdict;
  /** Non-null once the search budget (call count or source count) is spent. */
  checkSearchBudget(toolName: string): GuardVerdict;
  /**
   * Non-null while `maxConcurrentSearches` search-family calls are already in
   * flight. A DEFERRAL, not a failure: the same call may be repeated verbatim in
   * a later step, which is why the caller must run this BEFORE `checkDuplicate`
   * (that one registers the call key on the way through).
   */
  checkSearchConcurrency(toolName: string): GuardVerdict;
  /** Records an executed call (after all guards passed). */
  noteCall(toolName: string): void;
  /** Records that a call finished (result available). Lets emptyResultFallback
   *  tell an in-flight internal search from a completed-but-empty one. */
  noteCompletion(toolName: string): void;
  /** Records a model turn that produced neither text nor a tool call; returns the running count. */
  noteEmptyCompletion(): number;
  readonly emptyCompletions: number;
  /**
   * The tool the next step must be forced into, or null.
   *
   * Non-null exactly when the internal search has COMPLETED and registered
   * nothing, and the fallback tool has not run yet. Being ALLOWED to search the
   * web was never enough — permission the planner was free to ignore, and did:
   * the same question researched properly in one session and answered
   * ungrounded in the next, decided by nothing but sampling.
   */
  emptyResultFallback(): string | null;
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
  const maxConcurrentSearches = options.maxConcurrentSearches ?? MAX_CONCURRENT_SEARCHES;
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
        return reject(
          'duplicate',
          duplicateScope === 'turn'
            ? `Diese Suche lief schon (bereits mit ${toolName}: ${prior.join(' | ')}). Formuliere eine WIRKLICH ANDERE Suche oder antworte jetzt mit den vorhandenen Ergebnissen.`
            : 'Identischer Aufruf wiederholt — ändere die Parameter oder antworte dem*der Nutzer*in direkt.'
        );
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
          return reject(
            'near_duplicate',
            `Zu ähnlich zu einer bereits gelaufenen Suche (${prior.join(' | ')}). Wechsle das THEMA oder antworte jetzt mit den vorhandenen Ergebnissen.`
          );
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
        return reject(
          'failure_cap',
          'Zu viele Fehlversuche mit diesem Tool — erkläre dem*der Nutzer*in, was nicht geklappt hat.'
        );
      }
      return null;
    },
    checkTotalFailureBudget() {
      if (totalFailures >= maxTotal) {
        return reject(
          'failure_budget',
          'Zu viele fehlgeschlagene Tool-Aufrufe insgesamt — beantworte die Anfrage jetzt mit dem, was du bereits weißt.'
        );
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
        return reject(
          'search_budget',
          'Du hast bereits ausführlich gesucht — führe KEINE weitere Suche aus und beantworte die Frage jetzt mit den vorhandenen Quellen.'
        );
      }
      return null;
    },
    checkSearchConcurrency(toolName) {
      if (!searchToolNames.has(toolName)) return null;
      // In flight = called but not yet completed. `noteCall` bumps synchronously
      // before the tool is awaited and `noteCompletion` after its result lands,
      // so within one model step the first calls pass and the surplus sees a full
      // count — the same window `emptyResultFallback` relies on.
      let inFlight = 0;
      for (const name of searchToolNames) {
        inFlight += (callCounts.get(name) ?? 0) - (completedCounts.get(name) ?? 0);
      }
      if (inFlight >= maxConcurrentSearches) {
        return defer(
          'search_concurrency',
          `Es ${maxConcurrentSearches === 1 ? 'läuft' : 'laufen'} bereits ${maxConcurrentSearches} Suche${maxConcurrentSearches === 1 ? '' : 'n'}. Warte auf das Ergebnis, bewerte es — und suche erst dann weiter, wenn wirklich etwas fehlt. Diese Suche kannst du danach unverändert erneut starten.`
        );
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
    emptyResultFallback() {
      const policy = options.internalFallback;
      if (!policy) return null;
      // Three states — never called, in flight, completed. Only the third one
      // can be judged empty: forcing while a result may still land would race.
      const internalCalls = callCounts.get(policy.requiredTool) ?? 0;
      const internalCompleted = completedCounts.get(policy.requiredTool) ?? 0;
      if (internalCalls === 0 || internalCalls > internalCompleted) return null;
      if ((options.getSourceCount?.() ?? 0) > 0) return null;
      // Already searched the web on its own — nothing to force. Without this an
      // empty web search would be forced again every step until the budget ran
      // out.
      if ((callCounts.get(policy.fallbackTool) ?? 0) > 0) return null;
      return policy.fallbackTool;
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

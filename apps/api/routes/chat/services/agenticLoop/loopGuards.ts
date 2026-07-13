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
export const MAX_SEARCH_CALLS = 4;
export const MAX_SOURCES = 6;

export interface InternalFirstPolicy {
  /** Tool that must have run at least once before gated tools are allowed. */
  requiredTool: string;
  gatedTools: ReadonlySet<string>;
  /** True disables the policy for this turn (explicit web intent, temporal
   *  question, user-pasted URL). */
  exempt: boolean;
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
  maxSources?: number;
  /** Live source count (sourceRegistry.size) — checked alongside call count. */
  getSourceCount?: () => number;
  internalFirst?: InternalFirstPolicy;
}

export interface ToolLoopGuards {
  /** Rejects a repeated call — turn-wide normalized by default. */
  checkDuplicate(toolName: string, input: unknown): string | null;
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

  let lastKey = '';
  const seenKeys = new Set<string>();
  /** toolName → original (un-normalized) input descriptions, for error messages. */
  const priorInputs = new Map<string, string[]>();
  const callCounts = new Map<string, number>();
  let searchCalls = 0;
  const failures = new Map<string, number>();
  let totalFailures = 0;
  let emptyCompletions = 0;

  return {
    checkDuplicate(toolName, input) {
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
      lastKey = key;
      seenKeys.add(key);
      const prior = priorInputs.get(toolName) ?? [];
      prior.push(describeInput(input));
      priorInputs.set(toolName, prior);
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
      const sourceCount = options.getSourceCount?.() ?? 0;
      if (searchCalls >= maxSearchCalls || sourceCount >= maxSources) {
        return 'Genug Belege gesammelt — führe KEINE weitere Suche aus und antworte jetzt mit den vorhandenen Quellen.';
      }
      return null;
    },
    checkInternalFirst(toolName) {
      const policy = options.internalFirst;
      if (!policy || policy.exempt || !policy.gatedTools.has(toolName)) return null;
      if ((callCounts.get(policy.requiredTool) ?? 0) === 0) {
        return `Nutze zuerst ${policy.requiredTool} (interne Dokumente), bevor du das Web durchsuchst.`;
      }
      return null;
    },
    noteCall(toolName) {
      callCounts.set(toolName, (callCounts.get(toolName) ?? 0) + 1);
      if (searchToolNames.has(toolName)) searchCalls += 1;
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

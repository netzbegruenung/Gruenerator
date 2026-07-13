/**
 * Per-turn guard state for an agentic tool loop. Pure and dependency-light so
 * it unit-tests without the AI SDK / DB.
 *
 * Generalizes the two guards proven in the sharepic loop (consecutive
 * duplicate-call detection + per-tool failure cap) and adds two loop-wide
 * safeguards borrowed from LobeHub/OpenWebUI:
 *   - a total failure budget across all tools, and
 *   - an empty-completion counter (a model turn with neither text nor a tool
 *     call) so the caller can bail instead of spinning.
 *
 * The first three methods (`checkDuplicate`, `noteFailure`, `checkFailureCap`)
 * keep the exact semantics the sharepic loop relies on — `sharepicAgenticGuards`
 * re-exports `createToolLoopGuards` as `createLoopGuards` so that path is
 * behaviourally unchanged.
 */

export const MAX_FAILURES_PER_TOOL = 2;
export const MAX_TOTAL_FAILURES = 5;

export interface ToolLoopGuardOptions {
  maxFailuresPerTool?: number;
  maxTotalFailures?: number;
}

export interface ToolLoopGuards {
  /** Rejects an exactly-repeated call to the SAME tool as the previous one. */
  checkDuplicate(toolName: string, input: unknown): string | null;
  noteFailure(toolName: string): void;
  /** Non-null once a single tool has failed `maxFailuresPerTool` times. */
  checkFailureCap(toolName: string): string | null;
  /** Non-null once total failures across all tools hit `maxTotalFailures`. */
  checkTotalFailureBudget(): string | null;
  /** Records a model turn that produced neither text nor a tool call; returns the running count. */
  noteEmptyCompletion(): number;
  readonly emptyCompletions: number;
}

export function createToolLoopGuards(options: ToolLoopGuardOptions = {}): ToolLoopGuards {
  const maxPerTool = options.maxFailuresPerTool ?? MAX_FAILURES_PER_TOOL;
  const maxTotal = options.maxTotalFailures ?? MAX_TOTAL_FAILURES;

  let lastKey = '';
  const failures = new Map<string, number>();
  let totalFailures = 0;
  let emptyCompletions = 0;

  return {
    checkDuplicate(toolName, input) {
      const key = `${toolName}:${JSON.stringify(input)}`;
      if (key === lastKey) {
        return 'Identischer Aufruf wiederholt — ändere die Parameter oder antworte dem*der Nutzer*in direkt.';
      }
      lastKey = key;
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
    noteEmptyCompletion() {
      emptyCompletions += 1;
      return emptyCompletions;
    },
    get emptyCompletions() {
      return emptyCompletions;
    },
  };
}

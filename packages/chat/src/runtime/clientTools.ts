/**
 * Registry of tools the CLIENT executes during a chat turn.
 *
 * The backend pauses a turn with a `client_tool` interrupt (SSE), the
 * ModelAdapter looks the tool up here, runs `execute(args)` and posts the
 * result to the resume endpoint — the turn then continues server-side with the
 * result in context (run-then-answer, OpenWebUI-style).
 *
 * Adding a client tool = one entry here + a backend branch that emits the
 * interrupt and consumes the result on resume. `ask_human` is intentionally
 * NOT in this registry: it is a manual human-in-the-loop tool driven by
 * AskHumanToolUI/addResult, not an auto-executor.
 *
 * The names returned by {@link getAvailableClientTools} are sent as the
 * `clientTools` capability on every stream request, so the backend never emits
 * an interrupt this client cannot execute (mobile/voice send none).
 */

import { capFigures, parseComputeResult } from '../lib/computeResult';
import { useChatConfigStore } from '../stores/chatConfigStore';
import { useLastComputeStore } from '../stores/lastComputeStore';
import { usePythonFileStore } from '../stores/pythonFileStore';

export type ClientToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;

interface ClientToolEntry {
  /** Whether the host app injected the tool's runtime dependency. */
  isAvailable: () => boolean;
  execute: ClientToolExecutor;
}

const CLIENT_TOOLS: Record<string, ClientToolEntry> = {
  run_python: {
    isAvailable: () => !!useChatConfigStore.getState().runPython,
    execute: async (args) => {
      const code = typeof args.code === 'string' ? args.code : '';
      const runPython = useChatConfigStore.getState().runPython;
      if (!code || !runPython) return { error: 'run_python ist nicht verfügbar' };
      try {
        const files = usePythonFileStore.getState().files;
        const result = await runPython(code, files);
        const hasFigures = result.ok && result.figures.length > 0;
        if (!result.ok || (!result.stdout.trim() && !hasFigures)) {
          return { error: result.error || 'Die Ausführung lieferte keine Ausgabe.' };
        }
        const compute = parseComputeResult('Tabellen-Berechnung', result.stdout);
        // Matplotlib figures travel with the resume payload so the backend can
        // persist them in the message metadata (charts survive reloads).
        const figures = capFigures(result.figures);
        if (figures.length > 0) compute.figures = figures;
        // Also remember it locally so follow-up turns forward it as
        // `computedResult` (same path as the legacy auto-run code block).
        useLastComputeStore.getState().setResult(compute);
        return compute;
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  },
};

export function getClientToolExecutor(toolName: string): ClientToolExecutor | null {
  const entry = CLIENT_TOOLS[toolName];
  return entry && entry.isAvailable() ? entry.execute : null;
}

export function getAvailableClientTools(): string[] {
  return Object.entries(CLIENT_TOOLS)
    .filter(([, entry]) => entry.isAvailable())
    .map(([name]) => name);
}

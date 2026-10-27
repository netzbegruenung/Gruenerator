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

import { createChatApiClient } from '../context/ChatContext';
import { capComputeFiles, capFigures, parseComputeResult } from '../lib/computeResult';
import { type PythonFile, useChatConfigStore } from '../stores/chatConfigStore';
import { useAgentStore } from '../stores/chatStore';
import { useComputeExportStore } from '../stores/computeExportStore';
import { useLastComputeStore } from '../stores/lastComputeStore';
import { fetchThreadTabularFiles, usePythonFileStore } from '../stores/pythonFileStore';

/** What the turn knows about where the tool runs. */
export interface ClientToolContext {
  threadId: string;
}

export type ClientToolExecutor = (
  args: Record<string, unknown>,
  ctx?: ClientToolContext
) => Promise<unknown>;

/**
 * The interpreter's spreadsheets, refilled from the thread when the store is
 * empty. It is empty in the very turn that matters most: the first send of a
 * new thread puts the file in, the draft → thread switch clears it, and
 * `ThreadDataSyncEffect` fetched on that switch — before the server had saved
 * anything. The server now saves a suspending turn's attachments before it asks
 * the browser to run, so asking again here finds them (live 27.10.2026:
 * `NameError: name 'df' is not defined` after approving `tabelle_auswerten`).
 * Best-effort: without files the code still runs and reports its own error.
 */
async function pythonFilesFor(ctx: ClientToolContext | undefined): Promise<PythonFile[]> {
  const stored = usePythonFileStore.getState().files;
  if (stored.length > 0 || !ctx) return stored;
  try {
    const { fetch, onUnauthorized } = useChatConfigStore.getState();
    const files = await fetchThreadTabularFiles(
      createChatApiClient(fetch, onUnauthorized),
      ctx.threadId
    );
    // Keep them for the next run — unless the user has left the thread meanwhile.
    if (useAgentStore.getState().currentThreadId === ctx.threadId) {
      const fileStore = usePythonFileStore.getState();
      for (const f of files) fileStore.setFile(f);
    }
    return files;
  } catch (err) {
    console.warn('[run_python] Tabular file refill failed:', err);
    return stored;
  }
}

interface ClientToolEntry {
  /** Whether the host app injected the tool's runtime dependency. */
  isAvailable: () => boolean;
  execute: ClientToolExecutor;
}

const CLIENT_TOOLS: Record<string, ClientToolEntry> = {
  run_python: {
    isAvailable: () => !!useChatConfigStore.getState().runPython,
    execute: async (args, ctx) => {
      const code = typeof args.code === 'string' ? args.code : '';
      const runPython = useChatConfigStore.getState().runPython;
      if (!code || !runPython) return { error: 'run_python ist nicht verfügbar' };
      try {
        const files = await pythonFilesFor(ctx);
        const result = await runPython(code, files);
        const hasFigures = result.ok && result.figures.length > 0;
        const hasFiles = result.ok && result.files.length > 0;
        if (!result.ok || (!result.stdout.trim() && !hasFigures && !hasFiles)) {
          return { error: result.error || 'Die Ausführung lieferte keine Ausgabe.' };
        }
        const compute = parseComputeResult('Tabellen-Berechnung', result.stdout);
        // Matplotlib figures + exported files travel with the resume payload so
        // the backend can persist them in the message metadata (they survive
        // reloads, like generatedImage).
        const figures = capFigures(result.figures);
        if (figures.length > 0) compute.figures = figures;
        const computeFiles = capComputeFiles(result.files);
        // The answer model learns about exports via respondNode's fileNote
        // (from computedResult.files) — no synthetic entries, which would
        // duplicate the download chips and pollute the verifier prompt.
        if (computeFiles.length > 0) compute.files = computeFiles;
        // Keep the raw bytes in the session stash: the card's download chips
        // serve a fresh export from the browser (which just wrote the file)
        // instead of depending on the server asset round-trip.
        if (result.files.length > 0) useComputeExportStore.getState().stash(result.files);
        // Also remember it locally so follow-up turns forward it as
        // `computedResult` (same path as the legacy code block's Run button).
        useLastComputeStore.getState().setResult(compute);
        return compute;
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  },
  // `check_sharepic` des Loops: der Server kann Creator-Sharepics nicht zeichnen,
  // der Browser liefert das Bild für die Prüfung.
  render_sharepic: {
    isAvailable: () => !!useChatConfigStore.getState().renderSharepicSheet,
    execute: async (args) => {
      const renderSharepicSheet = useChatConfigStore.getState().renderSharepicSheet;
      const initialProps = args.initialProps;
      if (!renderSharepicSheet || typeof initialProps !== 'object' || initialProps === null) {
        return { image: null };
      }
      try {
        return { image: await renderSharepicSheet(initialProps as Record<string, unknown>) };
      } catch {
        // swallow-ok: ein Renderfehler heisst „kein Bild" — die Prüfung meldet das dem Modell
        return { image: null };
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

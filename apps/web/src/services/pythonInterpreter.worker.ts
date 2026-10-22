/// <reference lib="webworker" />
/**
 * Pyodide worker — runs LLM-generated Python (pandas/matplotlib) off the main
 * thread. Loads the runtime + wheels lazily from the self-hosted /pyodide/
 * directory (see scripts/setup-pyodide.mjs), so nothing is fetched from a CDN.
 *
 * Protocol: main thread posts { id, code, files }; worker replies
 * { id, progress } (zero or more) then exactly one { id, result }.
 *
 * The actual run logic (sanitize → packages → engines → harness) lives in
 * `@gruenerator/chat/pyodide` runCore so the Node integration tests exercise
 * the same code path against the real runtime.
 *
 * Isolation: the code this worker runs is model-written, and the worker shares
 * the app's origin. Its boundary is the Content-Security-Policy nginx sends
 * with THIS script (apps/web/Dockerfile, pinned by pythonInterpreterCsp.vitest.ts):
 * a dedicated worker enforces the policy of its own response, and that policy
 * allows network access to /pyodide/ only — no /api, no third party, no eval.
 * The Vite dev server sends no such header. runCore's import guard is defence
 * in depth on top, not the boundary.
 */
import { runPythonCore, type PyRuntime } from '@gruenerator/chat/pyodide';
import { loadPyodide } from 'pyodide';

import type { PythonFile } from '@gruenerator/chat/stores';

// Same-origin handles the CSP does not cover: without them generated code could
// read or overwrite the app's IndexedDB data (receipts, cached documents),
// poison the service worker's caches, or message the app's open tabs. Removed
// before Pyodide loads — a worker has no second realm to fetch fresh copies
// from. Walks the prototype chain because engines differ in where they define
// these.
for (const name of ['indexedDB', 'caches', 'BroadcastChannel']) {
  let scope: object | null = self;
  while (scope) {
    Reflect.deleteProperty(scope, name);
    scope = Object.getPrototypeOf(scope) as object | null;
  }
}

interface RunMessage {
  id: number;
  code: string;
  files: PythonFile[];
}

let pyodidePromise: Promise<PyRuntime> | null = null;

// Loads only the Pyodide core (no packages) — packages are loaded per run.
function getPyodide(onProgress: (msg: string) => void): Promise<PyRuntime> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      onProgress('Python-Laufzeit wird geladen …');
      return (await loadPyodide({ indexURL: '/pyodide/' })) as unknown as PyRuntime;
    })();
  }
  return pyodidePromise;
}

self.onmessage = async (event: MessageEvent<RunMessage>) => {
  const { id, code, files } = event.data;
  const post = (msg: Record<string, unknown>) =>
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ...msg });
  const onProgress = (message: string) => post({ progress: message });

  try {
    const py = await getPyodide(onProgress);
    const result = await runPythonCore(py, code, files ?? [], {
      onProgress,
      resolveWheelUrl: (fileName) => `/pyodide/${fileName}`,
    });
    post({ result });
  } catch (err) {
    // runPythonCore never throws — this only catches runtime-load failures.
    const traceback = err instanceof Error ? err.message : String(err);
    post({
      result: {
        ok: false,
        stdout: '',
        figures: [],
        files: [],
        error: traceback.trim().split('\n').pop() || 'Unbekannter Fehler',
        traceback,
        durationMs: 0,
      },
    });
  }
};

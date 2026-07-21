/**
 * Main-thread handle for the Pyodide worker. Exposes a single `runPython`
 * conforming to `@gruenerator/chat`'s RunPython contract, injected into the
 * chat config so packages/chat can run code without depending on apps/web.
 *
 * Timeout is enforced by terminating the worker — Pyodide is single-threaded
 * WASM and cannot be interrupted from within. After a kill the next call lazily
 * recreates the worker (paying the cold start again, which is rare).
 */
import type { CodeExecutionResult, RunPython } from '@gruenerator/chat/stores';

const DEFAULT_TIMEOUT_MS = 20_000;

let worker: Worker | null = null;
let seq = 0;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./pythonInterpreter.worker.ts', import.meta.url), {
      type: 'module',
      name: 'pyodide-interpreter',
    });
  }
  return worker;
}

export const runPython: RunPython = (code, files = [], options = {}) => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<CodeExecutionResult>((resolve) => {
    const w = getWorker();
    const id = ++seq;
    let settled = false;

    const finish = (result: CodeExecutionResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      w.removeEventListener('message', onMessage);
      resolve(result);
    };

    const timer = setTimeout(() => {
      // Only reliable kill switch for runaway WASM: drop the worker entirely.
      w.terminate();
      worker = null;
      finish({
        ok: false,
        stdout: '',
        figures: [],
        files: [],
        error: 'Zeitüberschreitung – der Code lief zu lange und wurde abgebrochen.',
        traceback: null,
        durationMs: timeoutMs,
      });
    }, timeoutMs);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { id: number; progress?: string; result?: CodeExecutionResult };
      if (data.id !== id) return;
      if (data.progress !== undefined) {
        options.onProgress?.(data.progress);
        return;
      }
      if (data.result) finish(data.result);
    };

    w.addEventListener('message', onMessage);
    // Transfer COPIES of the file buffers: transferring the originals detaches
    // them in the pythonFileStore, so every run after the first failed with
    // "ArrayBuffer at index 0 is already detached".
    const filesCopy = files.map((f) => ({ ...f, bytes: f.bytes.slice(0) }));
    w.postMessage(
      { id, code, files: filesCopy },
      filesCopy.map((f) => f.bytes)
    );
  });
};

export interface PyodideRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  result: string | null;
  images: string[];
}

interface WorkerResponse extends PyodideRunResult {
  id: string;
}

// Detect commonly-used packages from import statements so they get loaded
// before execution. Limited to packages bundled with the Pyodide distribution
// (loadable via loadPackage) — enough for typical data/plotting snippets.
const PACKAGE_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:import|from)\s+numpy\b/, 'numpy'],
  [/\b(?:import|from)\s+pandas\b/, 'pandas'],
  [/\b(?:import|from)\s+matplotlib\b/, 'matplotlib'],
  [/\b(?:import|from)\s+scipy\b/, 'scipy'],
  [/\b(?:import|from)\s+sklearn\b/, 'scikit-learn'],
  [/\b(?:import|from)\s+sympy\b/, 'sympy'],
];

function detectPackages(code: string): string[] {
  return PACKAGE_PATTERNS.filter(([re]) => re.test(code)).map(([, pkg]) => pkg);
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<string, (res: PyodideRunResult) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { id, ...result } = event.data;
      pending.get(id)?.(result);
      pending.delete(id);
    };
  }
  return worker;
}

/**
 * Run Python in a persistent in-browser Pyodide worker. The worker (and its
 * loaded Pyodide instance) is created lazily on first call and reused, so the
 * second run skips the ~multi-second Pyodide boot.
 */
export function runPython(code: string): Promise<PyodideRunResult> {
  const w = getWorker();
  const id = `py-${++seq}`;
  const packages = detectPackages(code);
  return new Promise<PyodideRunResult>((resolve) => {
    pending.set(id, resolve);
    w.postMessage({ id, code, packages });
  });
}

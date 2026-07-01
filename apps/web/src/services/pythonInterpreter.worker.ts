/// <reference lib="webworker" />
/**
 * Pyodide worker — runs LLM-generated Python (pandas/matplotlib) off the main
 * thread. Loads the runtime + wheels lazily from the self-hosted /pyodide/
 * directory (see scripts/setup-pyodide.mjs), so nothing is fetched from a CDN.
 *
 * Protocol: main thread posts { id, code, files }; worker replies
 * { id, progress } (zero or more) then exactly one { id, result }.
 */
import { loadPyodide } from 'pyodide';

import type { CodeExecutionResult, PythonFile } from '@gruenerator/chat/stores';

interface RunMessage {
  id: number;
  code: string;
  files: PythonFile[];
}

// Minimal typed facade over the handful of Pyodide APIs we use — pyodide's own
// .d.ts types several of these (FS, setStdout) loosely as `any`, which trips
// the no-unsafe-* lint rules. One boundary cast here keeps call sites typed.
interface PyRuntime {
  loadPackage(names: string[]): Promise<unknown>;
  FS: { writeFile(path: string, data: Uint8Array): void };
  setStdout(opts: { batched: (s: string) => void }): void;
  setStderr(opts: { batched: (s: string) => void }): void;
  globals: { set(key: string, value: unknown): void };
  runPythonAsync(code: string): Promise<unknown>;
}

let pyodidePromise: Promise<PyRuntime> | null = null;

function getPyodide(onProgress: (msg: string) => void): Promise<PyRuntime> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      onProgress('Python-Laufzeit wird geladen …');
      const py = (await loadPyodide({ indexURL: '/pyodide/' })) as unknown as PyRuntime;
      onProgress('Datenpakete werden geladen (pandas, matplotlib) …');
      await py.loadPackage(['pandas', 'matplotlib']);
      return py;
    })();
  }
  return pyodidePromise;
}

// Loads the first uploaded file into a pandas DataFrame `df` before user code
// runs. CSVs vary wildly (German `;`-separated, odd encodings) — let pandas
// sniff the separator. Excel (openpyxl) is not vendored yet → CSV only.
function buildSetup(file: PythonFile): string {
  const name = JSON.stringify(file.name);
  const lower = file.name.toLowerCase();
  const isExcel =
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    file.mimeType.includes('excel') ||
    file.mimeType.includes('spreadsheet');
  if (isExcel) {
    return `raise RuntimeError('Excel-Dateien werden derzeit nicht unterstützt – bitte als CSV exportieren.')`;
  }
  return `import pandas as pd\ndf = pd.read_csv(${name}, sep=None, engine='python')`;
}

// Runs setup + user code in a shared namespace, then serialises every open
// matplotlib figure to a base64 PNG. The trailing json.dumps is the value
// runPythonAsync returns.
const HARNESS = `
import io, base64, json
import matplotlib
matplotlib.use('AGG')
import matplotlib.pyplot as plt

_ns = {}
if __setup_code:
    exec(__setup_code, _ns)
exec(__user_code, _ns)

_figures = []
for _num in plt.get_fignums():
    _fig = plt.figure(_num)
    _buf = io.BytesIO()
    _fig.savefig(_buf, format='png', bbox_inches='tight', dpi=100)
    _figures.append(base64.b64encode(_buf.getvalue()).decode('ascii'))
plt.close('all')
json.dumps(_figures)
`;

self.onmessage = async (event: MessageEvent<RunMessage>) => {
  const { id, code, files } = event.data;
  const started = Date.now();
  let stdout = '';
  const post = (msg: Record<string, unknown>) =>
    (self as DedicatedWorkerGlobalScope).postMessage({ id, ...msg });

  try {
    const py = await getPyodide((message) => post({ progress: message }));

    stdout = '';
    py.setStdout({ batched: (s) => (stdout += s + '\n') });
    py.setStderr({ batched: (s) => (stdout += s + '\n') });

    for (const file of files ?? []) {
      py.FS.writeFile(file.name, new Uint8Array(file.bytes));
    }

    py.globals.set('__user_code', code);
    py.globals.set('__setup_code', files?.length ? buildSetup(files[0]) : '');

    const figuresJson = (await py.runPythonAsync(HARNESS)) as string;
    const figures = JSON.parse(figuresJson) as string[];

    const result: CodeExecutionResult = {
      ok: true,
      stdout,
      figures,
      error: null,
      traceback: null,
      durationMs: Date.now() - started,
    };
    post({ result });
  } catch (err) {
    const traceback = err instanceof Error ? err.message : String(err);
    const lines = traceback.trim().split('\n');
    const result: CodeExecutionResult = {
      ok: false,
      stdout,
      figures: [],
      error: lines[lines.length - 1] || 'Unbekannter Fehler',
      traceback,
      durationMs: Date.now() - started,
    };
    post({ result });
  }
};

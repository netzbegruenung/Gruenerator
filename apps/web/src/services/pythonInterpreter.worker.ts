/// <reference lib="webworker" />
/**
 * Pyodide worker — runs LLM-generated Python (pandas/matplotlib) off the main
 * thread. Loads the runtime + wheels lazily from the self-hosted /pyodide/
 * directory (see scripts/setup-pyodide.mjs), so nothing is fetched from a CDN.
 *
 * Protocol: main thread posts { id, code, files }; worker replies
 * { id, progress } (zero or more) then exactly one { id, result }.
 */
import { buildFileSetup, detectPyodidePackages, isXls, isXlsx } from '@gruenerator/chat/pyodide';
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

// The spreadsheet engines aren't in pyodide-lock.json, so they can't be
// loadPackage()-ed. They are vendored as pure-Python wheels under /pyodide/
// (see setup-pyodide.mjs) and installed once per worker via micropip, deps
// disabled so nothing is fetched from PyPI — the offline guarantee holds.
// Each engine is installed only when a file of its format is present:
//   .xlsx → openpyxl (+ et_xmlfile) · .xls → xlrd
const WHEELS_BY_ENGINE = {
  xlsx: [
    '/pyodide/et_xmlfile-2.0.0-py3-none-any.whl',
    '/pyodide/openpyxl-3.1.5-py2.py3-none-any.whl',
  ],
  xls: ['/pyodide/xlrd-2.0.2-py2.py3-none-any.whl'],
} as const;
const installedEngines = new Set<keyof typeof WHEELS_BY_ENGINE>();

async function ensureSpreadsheetEngine(
  py: PyRuntime,
  engine: keyof typeof WHEELS_BY_ENGINE,
  onProgress: (msg: string) => void
): Promise<void> {
  if (installedEngines.has(engine)) return;
  onProgress('Tabellen-Unterstützung wird geladen …');
  await py.loadPackage(['micropip']);
  const wheels = WHEELS_BY_ENGINE[engine].map((w) => `'${w}'`).join(',');
  await py.runPythonAsync(`import micropip\nawait micropip.install([${wheels}], deps=False)`);
  installedEngines.add(engine);
}

// Runs setup + user code in a shared namespace, then serialises every open
// matplotlib figure to a base64 PNG. matplotlib is collected only if it was
// loaded (per-need): MPLBACKEND=AGG is set before any import so a user's
// `import matplotlib.pyplot` picks the headless backend; the figure pass is
// guarded so snippets that never touch matplotlib don't require the wheel.
// The trailing json.dumps is the value runPythonAsync returns.
const HARNESS = `
import os, json
os.environ.setdefault('MPLBACKEND', 'AGG')

_ns = {}
if __setup_code:
    exec(__setup_code, _ns)
exec(__user_code, _ns)

_figures = []
try:
    import io, base64
    import matplotlib.pyplot as plt
    for _num in plt.get_fignums():
        _fig = plt.figure(_num)
        _buf = io.BytesIO()
        _fig.savefig(_buf, format='png', bbox_inches='tight', dpi=100)
        _figures.append(base64.b64encode(_buf.getvalue()).decode('ascii'))
    plt.close('all')
except ImportError:
    pass
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

    // Load only the packages this snippet imports (per-need). A CSV upload uses
    // pandas in the setup harness even if the user code doesn't import it.
    const packages = detectPyodidePackages(code);
    if (files?.length && !packages.includes('pandas')) packages.push('pandas');
    if (packages.length) {
      post({ progress: 'Pakete werden geladen …' });
      await py.loadPackage(packages);
    }

    // Spreadsheet engines are loadPackage-incompatible → install via micropip
    // only for the formats actually present, before the harness runs read_excel.
    const onProg = (message: string) => post({ progress: message });
    if (files?.some((f) => isXlsx(f.name, f.mimeType))) {
      await ensureSpreadsheetEngine(py, 'xlsx', onProg);
    }
    if (files?.some((f) => isXls(f.name, f.mimeType))) {
      await ensureSpreadsheetEngine(py, 'xls', onProg);
    }

    stdout = '';
    py.setStdout({ batched: (s) => (stdout += s + '\n') });
    py.setStderr({ batched: (s) => (stdout += s + '\n') });

    for (const file of files ?? []) {
      py.FS.writeFile(file.name, new Uint8Array(file.bytes));
    }

    py.globals.set('__user_code', code);
    py.globals.set(
      '__setup_code',
      files?.length ? buildFileSetup(files[0].name, files[0].mimeType) : ''
    );

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

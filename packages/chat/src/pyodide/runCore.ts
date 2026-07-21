/**
 * Platform-neutral core of the Python interpreter run: package loading,
 * spreadsheet-engine install, file staging, sanitization, harness execution
 * and result assembly. The apps/web worker is a thin postMessage wrapper
 * around this; the Node integration tests drive the SAME code against the
 * real Pyodide runtime + vendored wheels, so the execution path is covered
 * without a live browser session.
 *
 * Dependency-free (type-only imports) so the worker's module graph stays lean.
 */

import { sanitizePythonCode } from '../lib/pythonCodeSanitizer';
import { buildFileSetup, isXls, isXlsx } from '../lib/spreadsheetSetup';
import { detectPyodidePackages } from '../lib/pyodidePackages';

import type { CodeExecutionResult, PythonFile } from '../stores/chatConfigStore';

// Minimal typed facade over the handful of Pyodide APIs we use — pyodide's own
// .d.ts types several of these (FS, setStdout) loosely as `any`, which trips
// the no-unsafe-* lint rules. One boundary cast at the caller keeps call
// sites typed.
export interface PyRuntime {
  loadPackage(names: string[]): Promise<unknown>;
  FS: { writeFile(path: string, data: Uint8Array): void };
  setStdout(opts: { batched: (s: string) => void }): void;
  setStderr(opts: { batched: (s: string) => void }): void;
  globals: { set(key: string, value: unknown): void };
  runPythonAsync(code: string): Promise<unknown>;
}

// The spreadsheet engines aren't in pyodide-lock.json, so they can't be
// loadPackage()-ed. They are vendored as pure-Python wheels under /pyodide/
// (see apps/web/scripts/setup-pyodide.mjs) and installed once per runtime via
// micropip, deps disabled so nothing is fetched from PyPI — the offline
// guarantee holds. Each engine is installed only when a file of its format is
// present: .xlsx → openpyxl (+ et_xmlfile) · .xls → xlrd
export const ENGINE_WHEEL_FILES = {
  xlsx: ['et_xmlfile-2.0.0-py3-none-any.whl', 'openpyxl-3.1.5-py2.py3-none-any.whl'],
  xls: ['xlrd-2.0.2-py2.py3-none-any.whl'],
} as const;

export type SpreadsheetEngine = keyof typeof ENGINE_WHEEL_FILES;

export interface RunCoreOptions {
  onProgress?: (message: string) => void;
  /** Resolves an engine wheel file name to a micropip-installable URL/path.
   *  Browser worker: `(f) => '/pyodide/' + f`. Node tests stage the wheels
   *  into the pyodide FS and return `emfs:` paths. */
  resolveWheelUrl: (fileName: string) => string;
}

// Engines installed per runtime instance — a WeakMap (not module state) so a
// recreated runtime (e.g. after a timeout kill) installs them again.
const installedEnginesByRuntime = new WeakMap<PyRuntime, Set<SpreadsheetEngine>>();

async function ensureSpreadsheetEngine(
  py: PyRuntime,
  engine: SpreadsheetEngine,
  opts: RunCoreOptions
): Promise<void> {
  let installed = installedEnginesByRuntime.get(py);
  if (!installed) {
    installed = new Set();
    installedEnginesByRuntime.set(py, installed);
  }
  if (installed.has(engine)) return;
  opts.onProgress?.('Tabellen-Unterstützung wird geladen …');
  await py.loadPackage(['micropip']);
  const wheels = ENGINE_WHEEL_FILES[engine].map((f) => `'${opts.resolveWheelUrl(f)}'`).join(',');
  await py.runPythonAsync(`import micropip\nawait micropip.install([${wheels}], deps=False)`);
  installed.add(engine);
}

// Runs setup + user code in a shared namespace, then serialises every open
// matplotlib figure to a base64 PNG. matplotlib is collected only if it was
// loaded (per-need): MPLBACKEND=AGG is set before any import so a user's
// `import matplotlib.pyplot` picks the headless backend; the figure pass is
// guarded so snippets that never touch matplotlib don't require the wheel.
// The trailing json.dumps is the value runPythonAsync returns.
const HARNESS = `
import os, json, base64
os.environ.setdefault('MPLBACKEND', 'AGG')

# Persistent namespace across runs (Jupyter/OpenWebUI semantics): follow-up
# code blocks in the same conversation routinely reference variables defined
# by earlier blocks ("NameError: name 'top' is not defined" in beta). The
# setup snippet re-executes each run, so \`df\` always reflects the CURRENT
# turn's file even though older variables stay alive.
try:
    _gruen_ns
except NameError:
    _gruen_ns = {}
try:
    _gruen_files_fp
except NameError:
    _gruen_files_fp = None

# The worker is a page-lifetime singleton, so without a reset seam the
# namespace (and old files in the FS) would leak ACROSS THREADS: switching to
# a different spreadsheet could silently compute with the previous thread's
# variables. The input-file fingerprint (names+sizes) is the session key —
# when it changes, wipe the namespace and every stale file in the cwd.
if __files_fp != _gruen_files_fp:
    _gruen_ns = {}
    _gruen_files_fp = __files_fp
    _keep = set(__input_files)
    for _n in os.listdir('.'):
        if _n not in _keep and os.path.isfile(_n):
            try:
                os.remove(_n)
            except OSError:
                pass
_ns = _gruen_ns

# Snapshot the working directory (name → mtime) so files the USER CODE writes
# (exports like df.to_csv('export.csv')) can be collected afterwards — new OR
# re-written files count, so re-running an export in the same session still
# surfaces the download. Input files are staged fresh every run (their mtime
# changes), so they are excluded by name via __input_files.
_before = {}
for _n in os.listdir('.'):
    try:
        _before[_n] = os.path.getmtime(_n)
    except OSError:
        pass

# Block browser-bridge modules for USER code only (OpenWebUI pattern): 'js'
# gives generated code DOM/network access. The guard checks the importer's
# __name__ — our exec namespace has none — so library internals (micropip,
# pyodide itself) keep working. Patched once per runtime.
import builtins
if not getattr(builtins, '_gruen_import_guarded', False):
    _gruen_real_import = builtins.__import__
    def _gruen_guarded_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name.split('.')[0] in ('js', 'pyodide_js', 'pyodide'):
            _imp = globals.get('__name__') if globals else None
            if _imp in (None, '__main__'):
                raise ImportError(f"Das Modul '{name}' ist im Interpreter nicht erlaubt.")
        return _gruen_real_import(name, globals, locals, fromlist, level)
    builtins.__import__ = _gruen_guarded_import
    builtins._gruen_import_guarded = True

if __setup_code:
    exec(__setup_code, _ns)

# Jupyter semantics for the last statement: a bare trailing expression
# (df.describe(), 1 + 1) prints its repr instead of vanishing — models on the
# legacy path routinely omit the print().
import ast
_tree = ast.parse(__user_code)
if _tree.body and isinstance(_tree.body[-1], ast.Expr):
    _last = ast.Expression(_tree.body[-1].value)
    _tree.body = _tree.body[:-1]
    exec(compile(_tree, '<gruenerator>', 'exec'), _ns)
    _val = eval(compile(_last, '<gruenerator>', 'eval'), _ns)
    if _val is not None:
        print(repr(_val))
else:
    exec(compile(_tree, '<gruenerator>', 'exec'), _ns)

_figures = []
try:
    import io
    import matplotlib.pyplot as plt
    for _num in plt.get_fignums():
        _fig = plt.figure(_num)
        _buf = io.BytesIO()
        _fig.savefig(_buf, format='png', bbox_inches='tight', dpi=100)
        _figures.append(base64.b64encode(_buf.getvalue()).decode('ascii'))
    plt.close('all')
except ImportError:
    pass

# Files written by this run (new or re-written) — capped (5 files / 10 MB
# total) so the postMessage payload stays bounded.
_files = []
_total = 0
_inputs = set(__input_files)
for _name in sorted(os.listdir('.')):
    if len(_files) >= 5:
        break
    if _name in _inputs:
        continue
    try:
        if not os.path.isfile(_name):
            continue
        _m = os.path.getmtime(_name)
        if _name in _before and _before[_name] == _m:
            continue
        _size = os.path.getsize(_name)
        if _total + _size > 10 * 1024 * 1024:
            continue
        with open(_name, 'rb') as _f:
            _files.append({'name': _name, 'b64': base64.b64encode(_f.read()).decode('ascii')})
        _total += _size
    except OSError:
        pass

json.dumps({'figures': _figures, 'files': _files})
`;

/**
 * Execute one snippet against a loaded Pyodide runtime: sanitize the code,
 * load required packages + spreadsheet engines, stage the files, run the
 * harness and return the structured result. Never throws — errors come back
 * as `ok: false` results, mirroring the worker protocol.
 */
export async function runPythonCore(
  py: PyRuntime,
  rawCode: string,
  files: PythonFile[],
  opts: RunCoreOptions
): Promise<CodeExecutionResult> {
  // LLM-generated code sometimes carries typographic quotes / NBSP, which
  // Python rejects ("unterminated string literal") — normalize before exec.
  const code = sanitizePythonCode(rawCode);
  const started = Date.now();
  let stdout = '';

  try {
    // Load only the packages this snippet imports (per-need). A CSV upload uses
    // pandas in the setup harness even if the user code doesn't import it.
    const packages = detectPyodidePackages(code);
    if (files.length && !packages.includes('pandas')) packages.push('pandas');
    if (packages.length) {
      opts.onProgress?.('Pakete werden geladen …');
      await py.loadPackage(packages);
    }

    // Spreadsheet engines are loadPackage-incompatible → install via micropip
    // only for the formats actually present, before the harness runs read_excel.
    if (files.some((f) => isXlsx(f.name, f.mimeType))) {
      await ensureSpreadsheetEngine(py, 'xlsx', opts);
    }
    if (files.some((f) => isXls(f.name, f.mimeType))) {
      await ensureSpreadsheetEngine(py, 'xls', opts);
    }

    stdout = '';
    py.setStdout({ batched: (s) => (stdout += s + '\n') });
    py.setStderr({ batched: (s) => (stdout += s + '\n') });

    for (const file of files) {
      py.FS.writeFile(file.name, new Uint8Array(file.bytes));
    }

    py.globals.set('__user_code', code);
    py.globals.set(
      '__setup_code',
      files.length ? buildFileSetup(files[0].name, files[0].mimeType) : ''
    );
    // Staged fresh every run (mtime changes), so the harness excludes them
    // from the output-file collection by name.
    py.globals.set(
      '__input_files',
      files.map((f) => f.name)
    );
    // Session key for the namespace-reset seam: a different file set (thread
    // switch, replaced upload) wipes the persistent namespace + stale files.
    py.globals.set(
      '__files_fp',
      files
        .map((f) => `${f.name}:${f.bytes.byteLength}`)
        .sort()
        .join('|')
    );

    const harnessJson = (await py.runPythonAsync(HARNESS)) as string;
    const harnessResult = JSON.parse(harnessJson) as {
      figures: string[];
      files: Array<{ name: string; b64: string }>;
    };

    return {
      ok: true,
      stdout,
      figures: harnessResult.figures,
      files: harnessResult.files.map((f) => ({ name: f.name, base64: f.b64 })),
      error: null,
      traceback: null,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    const traceback = err instanceof Error ? err.message : String(err);
    const lines = traceback.trim().split('\n');
    return {
      ok: false,
      stdout,
      figures: [],
      files: [],
      error: lines[lines.length - 1] || 'Unbekannter Fehler',
      traceback,
      durationMs: Date.now() - started,
    };
  }
}

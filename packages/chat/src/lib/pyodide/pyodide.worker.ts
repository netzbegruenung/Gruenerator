/// <reference lib="webworker" />
import { loadPyodide, version as pyodideVersion, type PyodideInterface } from 'pyodide';

// Pyodide's JS glue ships in the npm package; the wasm/data assets are fetched
// from the jsdelivr CDN at the EXACT matching version (avoids bundling ~10MB).
const INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`;

interface ExecuteRequest {
  id: string;
  code: string;
  packages?: string[];
}

interface ExecuteResponse {
  id: string;
  ok: boolean;
  stdout: string;
  stderr: string;
  result: string | null;
  images: string[];
}

let pyodideReady: Promise<PyodideInterface> | null = null;
let stdoutBuffer = '';
let stderrBuffer = '';

async function getPyodide(): Promise<PyodideInterface> {
  if (!pyodideReady) {
    pyodideReady = loadPyodide({
      indexURL: INDEX_URL,
      stdout: (text) => {
        stdoutBuffer += `${text}\n`;
      },
      stderr: (text) => {
        stderrBuffer += `${text}\n`;
      },
    });
  }
  return pyodideReady;
}

// matplotlib's WASM backend needs js.document (absent in a worker). Redirect
// plt.show() to emit a base64 PNG data-URI on stdout instead (open-webui trick).
const MATPLOTLIB_PATCH = `import base64, os
from io import BytesIO
os.environ["MPLBACKEND"] = "AGG"
import matplotlib.pyplot as _plt

def _gruenerator_show(*args, **kwargs):
    buf = BytesIO()
    _plt.savefig(buf, format="png")
    buf.seek(0)
    img = base64.b64encode(buf.read()).decode("utf-8")
    _plt.clf()
    buf.close()
    print(f"data:image/png;base64,{img}")

_plt.show = _gruenerator_show
`;

const DATA_URI_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** Split matplotlib data-URI lines out of stdout into a separate images list. */
function extractImages(stdout: string): { text: string; images: string[] } {
  const images: string[] = [];
  const kept: string[] = [];
  for (const line of stdout.split('\n')) {
    if (DATA_URI_RE.test(line.trim())) {
      images.push(line.trim());
    } else {
      kept.push(line);
    }
  }
  return { text: kept.join('\n').replace(/\n+$/, ''), images };
}

/** Best-effort JSON-safe stringification of a Python return value. */
function stringifyResult(result: unknown): string | null {
  if (result == null) return null;
  if (typeof result === 'string') return result;
  if (typeof result === 'number' || typeof result === 'boolean' || typeof result === 'bigint') {
    return String(result);
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

async function execute({ id, code, packages = [] }: ExecuteRequest): Promise<void> {
  stdoutBuffer = '';
  stderrBuffer = '';
  const pyodide = await getPyodide();

  try {
    if (packages.length > 0) {
      await pyodide.loadPackage(packages);
    }
    if (code.includes('matplotlib')) {
      await pyodide.runPythonAsync(MATPLOTLIB_PATCH);
    }
    const raw = await pyodide.runPythonAsync(code);
    const result = stringifyResult(raw && typeof raw.toJs === 'function' ? raw.toJs() : raw);
    const { text, images } = extractImages(stdoutBuffer);
    const response: ExecuteResponse = {
      id,
      ok: !stderrBuffer,
      stdout: text,
      stderr: stderrBuffer.replace(/\n+$/, ''),
      result,
      images,
    };
    self.postMessage(response);
  } catch (error: unknown) {
    const { text, images } = extractImages(stdoutBuffer);
    const message = error instanceof Error ? error.message : String(error);
    const response: ExecuteResponse = {
      id,
      ok: false,
      stdout: text,
      stderr: [stderrBuffer.replace(/\n+$/, ''), message].filter(Boolean).join('\n'),
      result: null,
      images,
    };
    self.postMessage(response);
  }
}

self.onmessage = (event: MessageEvent<ExecuteRequest>) => {
  void execute(event.data);
};

export {};

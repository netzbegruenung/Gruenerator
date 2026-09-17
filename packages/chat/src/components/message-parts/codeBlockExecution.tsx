import { type ChatChartData } from '@gruenerator/ui';
import { FileDown } from 'lucide-react';
import { type ReactNode, isValidElement, useCallback, useEffect, useState } from 'react';

import { parseComputeResult } from '../../lib/computeResult';
import { downloadBase64, mimeFromFilename } from '../../lib/downloadBlob';
import { useChatConfigStore, type CodeExecutionResult } from '../../stores/chatConfigStore';
import { useLastComputeStore } from '../../stores/lastComputeStore';
import { usePythonFileStore } from '../../stores/pythonFileStore';

import { useIsMessageStreaming } from './messageStreamingContext';

/**
 * Renderer-independent pieces of a chat code block: the Pyodide run/auto-run
 * logic, the chart payload parser and the result card. ChatCodeBlock (legacy
 * react-markdown chrome) and StreamdownCodeBlock (Streamdown chrome) differ
 * only in how they draw the block around these.
 */

/** Heuristic: does this code operate on the pre-loaded pandas `df`? Used to (a)
 *  treat a mis-tagged fence (``` instead of ```python) as runnable when a table
 *  is loaded, and (b) decide whether to auto-run it. */
function looksLikePandas(code: string): boolean {
  return /(^|[^.\w])df[^\w]/.test(code) || /\bimport\s+pandas\b/.test(code) || /\bpd\./.test(code);
}

/** Code blocks auto-run at most once per unique source across re-mounts. */
const autoRunSeen = new Set<string>();

/** Parse a ```chart fenced block's JSON into a renderable chart, or null if the
 *  payload is malformed / not chart-shaped (then we fall back to a code view). */
export function parseChart(code: string): ChatChartData | null {
  try {
    const parsed = JSON.parse(code) as Partial<ChatChartData>;
    if (
      parsed &&
      typeof parsed.type === 'string' &&
      Array.isArray(parsed.data) &&
      typeof parsed.xKey === 'string' &&
      Array.isArray(parsed.yKeys)
    ) {
      return parsed as ChatChartData;
    }
  } catch {
    /* malformed JSON — fall through to the plain code block */
  }
  return null;
}

/** Recursively collect the text content of a markdown renderer's nested children. */
export function toText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (isValidElement(node)) {
    return toText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

/**
 * In-browser execution state for one code block. Runnable when the host
 * injected runPython (web) AND it's Python — either tagged ```python, OR a
 * mis-tagged fence that clearly operates on the pre-loaded `df` (models
 * sometimes drop the language tag). The latter also gates auto-run.
 */
export function useCodeExecution(code: string, language: string) {
  const runPython = useChatConfigStore((s) => s.runPython);
  const pythonFiles = usePythonFileStore((s) => s.files);
  const setLastCompute = useLastComputeStore((s) => s.setResult);
  const isStreaming = useIsMessageStreaming();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [output, setOutput] = useState<CodeExecutionResult | null>(null);

  const hasTable = pythonFiles.length > 0;
  const isTabularCompute = hasTable && looksLikePandas(code);
  const canRun = !!runPython && (language === 'python' || isTabularCompute);
  // Treat a mis-tagged compute fence as python for highlighting + the label.
  const effectiveLanguage = language === 'text' && isTabularCompute ? 'python' : language;

  const runCode = useCallback(async () => {
    if (!runPython) return;
    setRunning(true);
    setProgress('Wird ausgeführt …');
    try {
      const result = await runPython(code, pythonFiles, { onProgress: setProgress });
      setOutput(result);
      // Remember a successful spreadsheet result so the next turn can forward it
      // to the model (it can't see the browser-computed number otherwise).
      if (result.ok && result.stdout.trim() && isTabularCompute) {
        setLastCompute(parseComputeResult('Tabellen-Berechnung', result.stdout));
      }
    } catch (error) {
      setOutput({
        ok: false,
        stdout: '',
        figures: [],
        files: [],
        error: error instanceof Error ? error.message : String(error),
        traceback: null,
        durationMs: 0,
      });
    } finally {
      setRunning(false);
    }
  }, [code, runPython, pythonFiles, isTabularCompute, setLastCompute]);

  // Auto-run a spreadsheet-compute block exactly once, after it has finished
  // streaming — so the answer appears without the user hunting for a Run button.
  // Non-tabular code and half-streamed blocks are never auto-run.
  useEffect(() => {
    if (isStreaming || !canRun || !isTabularCompute) return;
    if (output || running || autoRunSeen.has(code)) return;
    autoRunSeen.add(code);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guarded one-shot auto-run after streaming finishes; runCode's setState fires inside an async task, not synchronously
    void runCode();
  }, [isStreaming, canRun, isTabularCompute, code, output, running, runCode]);

  return { canRun, isTabularCompute, effectiveLanguage, running, progress, output, runCode };
}

export function CodeOutput({
  output,
  className = 'border-t border-border/60 px-4 py-3 text-sm',
}: {
  output: CodeExecutionResult;
  className?: string;
}) {
  const { stdout, error, figures, files } = output;
  const hasContent = stdout || error || figures.length > 0 || files.length > 0;
  return (
    <div className={className}>
      <div className="mb-1 font-mono text-xs uppercase tracking-wide text-foreground-muted">
        Ergebnis
      </div>
      {figures.map((fig, i) => (
        <img
          // Index key on purpose: every PNG shares the same base64 prefix
          // (signature + IHDR), so content-slice keys collide.
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          src={`data:image/png;base64,${fig}`}
          alt={`Diagramm ${i + 1}`}
          className="mb-2 max-w-full rounded border border-border"
        />
      ))}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((file) => (
            <button
              key={file.name}
              onClick={() =>
                void downloadBase64(file.base64, file.name, mimeFromFilename(file.name))
              }
              className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
            >
              <FileDown className="h-3.5 w-3.5 text-primary" />
              {file.name}
            </button>
          ))}
        </div>
      )}
      {stdout && (
        <pre className="overflow-x-auto whitespace-pre-wrap text-code-block-fg">{stdout}</pre>
      )}
      {error && (
        <pre className="overflow-x-auto whitespace-pre-wrap text-red-600 dark:text-red-400">
          {error}
        </pre>
      )}
      {!hasContent && <span className="text-foreground-muted">Keine Ausgabe.</span>}
    </div>
  );
}

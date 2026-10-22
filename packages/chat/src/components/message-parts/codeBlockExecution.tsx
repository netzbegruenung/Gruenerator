import { FileDown } from 'lucide-react';
import { type ReactNode, isValidElement, useCallback, useState } from 'react';

import { parseComputeResult } from '../../lib/computeResult';
import { downloadBase64, mimeFromFilename } from '../../lib/downloadBlob';
import { useChatConfigStore, type CodeExecutionResult } from '../../stores/chatConfigStore';
import { useLastComputeStore } from '../../stores/lastComputeStore';
import { usePythonFileStore } from '../../stores/pythonFileStore';

/**
 * Renderer-independent pieces of a chat code block: the Pyodide run logic and
 * the result card. ChatCodeBlock (legacy
 * react-markdown chrome) and StreamdownCodeBlock (Streamdown chrome) differ
 * only in how they draw the block around these.
 */

/** Heuristic: does this code operate on the pre-loaded pandas `df`? Used to (a)
 *  treat a mis-tagged fence (``` instead of ```python) as runnable when a table
 *  is loaded, and (b) collapse it and remember its result as a computation. */
function looksLikePandas(code: string): boolean {
  return /(^|[^.\w])df[^\w]/.test(code) || /\bimport\s+pandas\b/.test(code) || /\bpd\./.test(code);
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
 * sometimes drop the language tag).
 *
 * Never runs on its own: the block is model output, and a spreadsheet's text
 * reaches the model verbatim, so the person clicks "Ausführen" first. The
 * run_python tool stays automatic; what bounds both is the worker's sandbox
 * CSP (apps/web/src/services/pythonInterpreter.worker.ts).
 */
export function useCodeExecution(code: string, language: string) {
  const runPython = useChatConfigStore((s) => s.runPython);
  const pythonFiles = usePythonFileStore((s) => s.files);
  const setLastCompute = useLastComputeStore((s) => s.setResult);
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

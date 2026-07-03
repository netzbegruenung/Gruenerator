import {
  type ReactNode,
  Suspense,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Check, ChevronDown, ChevronRight, Copy, FileDown, Loader2, Play } from 'lucide-react';
import { type ChatChartData } from '@gruenerator/ui';
import { highlightCode, normalizeLang } from '../../lib/shikiHighlight';
import { parseComputeResult } from '../../lib/computeResult';
import { downloadBase64, mimeFromFilename } from '../../lib/downloadBlob';
import { useChatConfigStore, type CodeExecutionResult } from '../../stores/chatConfigStore';
import { usePythonFileStore } from '../../stores/pythonFileStore';
import { useLastComputeStore } from '../../stores/lastComputeStore';
import { MermaidDiagram } from './MermaidDiagram';
import { LazyChatChart } from './LazyChatChart';
import { useIsMessageStreaming } from './messageStreamingContext';

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
function parseChart(code: string): ChatChartData | null {
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

/** Recursively collect the text content of react-markdown's nested children. */
function toText(node: ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(toText).join('');
  if (isValidElement(node)) {
    return toText((node.props as { children?: ReactNode }).children);
  }
  return '';
}

/** Extract { language, code } from the `<code class="language-x">` child that
 *  react-markdown passes to the `pre` override. */
function extractCodeInfo(children: ReactNode): { language: string; code: string } {
  let className = '';
  if (isValidElement(children)) {
    className = ((children.props as { className?: string }).className as string) ?? '';
  }
  const match = /language-(\w+)/.exec(className);
  const language = normalizeLang(match?.[1]);
  return { language, code: toText(children).replace(/\n$/, '') };
}

export function ChatCodeBlock({ children }: { children?: ReactNode }) {
  const { language, code } = extractCodeInfo(children);
  const runPython = useChatConfigStore((s) => s.runPython);
  const pythonFiles = usePythonFileStore((s) => s.files);
  const setLastCompute = useLastComputeStore((s) => s.setResult);
  const isStreaming = useIsMessageStreaming();
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState('');
  const [output, setOutput] = useState<CodeExecutionResult | null>(null);
  // Spreadsheet-compute scripts are collapsed by default: the user cares about
  // the result (output card + answer text), not the generated pandas code.
  const [codeExpanded, setCodeExpanded] = useState(false);

  const hasTable = pythonFiles.length > 0;
  // Runnable when the host injected runPython (web) AND it's Python — either
  // tagged ```python, OR a mis-tagged fence that clearly operates on the
  // pre-loaded `df` (models sometimes drop the language tag). The latter also
  // gates auto-run below.
  const isTabularCompute = hasTable && looksLikePandas(code);
  const canRun = !!runPython && (language === 'python' || isTabularCompute);
  // Treat a mis-tagged compute fence as python for highlighting + the label.
  const effectiveLanguage = language === 'text' && isTabularCompute ? 'python' : language;
  const isMermaid = language === 'mermaid';
  // Charts render from the same ```chart block whether streaming live or reloaded
  // from history — the block is persisted in the message text, so there is one
  // render path. A malformed payload falls back to the normal code view.
  const chart = useMemo(() => (language === 'chart' ? parseChart(code) : null), [language, code]);

  useEffect(() => {
    if (isMermaid || chart) return;
    let active = true;
    highlightCode(code, effectiveLanguage)
      .then((result) => {
        if (active) setHtml(result);
      })
      .catch(() => {
        /* fall back to the plain <pre> below */
      });
    return () => {
      active = false;
    };
  }, [code, effectiveLanguage, isMermaid, chart]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

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
    void runCode();
  }, [isStreaming, canRun, isTabularCompute, code, output, running, runCode]);

  if (chart) {
    return (
      <Suspense
        fallback={
          <div className="my-3 flex min-h-[240px] items-center justify-center rounded-lg border border-border bg-card">
            <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
          </div>
        }
      >
        <LazyChatChart data={chart} />
      </Suspense>
    );
  }

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-code-block-bg">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
        <span className="font-mono text-xs text-foreground-muted">
          {isTabularCompute
            ? 'Tabellen-Berechnung'
            : effectiveLanguage === 'text'
              ? 'Code'
              : effectiveLanguage}
        </span>
        <div className="flex items-center gap-1">
          {isTabularCompute && (
            <button
              onClick={() => setCodeExpanded((v) => !v)}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground-muted hover:bg-primary/10 hover:text-foreground"
              aria-expanded={codeExpanded}
            >
              {codeExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {codeExpanded ? 'Code verbergen' : 'Code anzeigen'}
            </button>
          )}
          {canRun && (
            <button
              onClick={runCode}
              disabled={running}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground-muted hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
              aria-label="Code ausführen"
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Ausführen
            </button>
          )}
          <button
            onClick={handleCopy}
            className="rounded-md p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            aria-label="Code kopieren"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {(!isTabularCompute || codeExpanded) &&
        (isMermaid ? (
          <MermaidDiagram code={code} />
        ) : html ? (
          <div
            className="overflow-x-auto p-4 text-sm [&_pre]:!m-0 [&_pre]:!bg-transparent"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="overflow-x-auto p-4 text-sm text-code-block-fg">
            <code>{code}</code>
          </pre>
        ))}

      {running && !output && (
        <div className="border-t border-border/60 px-4 py-2 text-xs text-foreground-muted">
          {progress}
        </div>
      )}

      {output && <CodeOutput output={output} />}
    </div>
  );
}

function CodeOutput({ output }: { output: CodeExecutionResult }) {
  const { stdout, error, figures, files } = output;
  const hasContent = stdout || error || figures.length > 0 || files.length > 0;
  return (
    <div className="border-t border-border/60 px-4 py-3 text-sm">
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
              onClick={() => downloadBase64(file.base64, file.name, mimeFromFilename(file.name))}
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

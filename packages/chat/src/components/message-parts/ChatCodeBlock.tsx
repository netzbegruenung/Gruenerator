import { type ReactNode, isValidElement, useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, Play } from 'lucide-react';
import { highlightCode, normalizeLang } from '../../lib/shikiHighlight';
import { runPython, type PyodideRunResult } from '../../lib/pyodide/pyodideRunner';

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
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<PyodideRunResult | null>(null);

  const canRun = language === 'python';

  useEffect(() => {
    let active = true;
    highlightCode(code, language)
      .then((result) => {
        if (active) setHtml(result);
      })
      .catch(() => {
        /* fall back to the plain <pre> below */
      });
    return () => {
      active = false;
    };
  }, [code, language]);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [code]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    try {
      setOutput(await runPython(code));
    } catch (error) {
      setOutput({
        ok: false,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        result: null,
        images: [],
      });
    } finally {
      setRunning(false);
    }
  }, [code]);

  return (
    <div className="my-3 overflow-hidden rounded-lg border border-border bg-code-block-bg">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5">
        <span className="font-mono text-xs text-foreground-muted">
          {language === 'text' ? 'Code' : language}
        </span>
        <div className="flex items-center gap-1">
          {canRun && (
            <button
              onClick={handleRun}
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

      {html ? (
        <div
          className="overflow-x-auto p-4 text-sm [&_pre]:!bg-transparent [&_pre]:!m-0"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-4 text-sm text-code-block-fg">
          <code>{code}</code>
        </pre>
      )}

      {output && <CodeOutput output={output} />}
    </div>
  );
}

function CodeOutput({ output }: { output: PyodideRunResult }) {
  const { stdout, stderr, result, images } = output;
  const hasText = stdout || stderr || result;
  return (
    <div className="border-t border-border/60 px-4 py-3 text-sm">
      <div className="mb-1 font-mono text-xs uppercase tracking-wide text-foreground-muted">
        Ergebnis
      </div>
      {stdout && (
        <pre className="overflow-x-auto whitespace-pre-wrap text-code-block-fg">{stdout}</pre>
      )}
      {result && (
        <pre className="overflow-x-auto whitespace-pre-wrap text-code-block-fg">{result}</pre>
      )}
      {stderr && (
        <pre className="overflow-x-auto whitespace-pre-wrap text-red-600 dark:text-red-400">
          {stderr}
        </pre>
      )}
      {!hasText && images.length === 0 && (
        <span className="text-foreground-muted">Keine Ausgabe.</span>
      )}
      {images.map((src, i) => (
        <img key={i} src={src} alt="Python-Ausgabe" className="mt-2 max-w-full rounded" />
      ))}
    </div>
  );
}

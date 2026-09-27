import { Check, ChevronDown, ChevronRight, Copy, Loader2, Play } from 'lucide-react';
import {
  type ReactNode,
  Suspense,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { highlightCode, normalizeLang } from '../../lib/shikiHighlight';

import { CodeOutput, parseChart, toText, useCodeExecution } from './codeBlockExecution';
import { LazyChatChart } from './LazyChatChart';
import { MermaidDiagram } from './MermaidDiagram';

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

/**
 * Code block of the legacy react-markdown renderer: our own chrome around the
 * shared execution logic (codeBlockExecution). The Streamdown renderer draws
 * Streamdown's chrome instead — see StreamdownCodeBlock.
 */
export function ChatCodeBlock({ children }: { children?: ReactNode }) {
  const { language, code } = extractCodeInfo(children);
  const { canRun, isTabularCompute, effectiveLanguage, running, progress, output, runCode } =
    useCodeExecution(code, language);
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Spreadsheet-compute scripts are collapsed by default: the user cares about
  // the result (output card + answer text), not the generated pandas code.
  const [codeExpanded, setCodeExpanded] = useState(false);

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

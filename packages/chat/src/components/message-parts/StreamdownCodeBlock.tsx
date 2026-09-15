import { ChevronDown, ChevronRight, Loader2, Play } from 'lucide-react';
import { Suspense, useContext, useMemo, useState } from 'react';
import {
  CodeBlock,
  CodeBlockContainer,
  CodeBlockCopyButton,
  CodeBlockDownloadButton,
  CodeBlockHeader,
  StreamdownContext,
  type StreamdownContextType,
  useIsCodeFenceIncomplete,
} from 'streamdown';

import { CodeOutput, parseChart, useCodeExecution } from './codeBlockExecution';
import { LazyChatChart } from './LazyChatChart';
import { MermaidDiagram } from './MermaidDiagram';

// Same look as Streamdown's own copy/download buttons, so ours sit in the
// actions bar as if they were upstream.
const ACTION_BUTTON =
  'flex cursor-pointer items-center gap-1 p-1 text-xs text-muted-foreground transition-all hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50';

/** Mirrors Streamdown's own reading of `controls` for the code group. */
function codeControlsEnabled(controls: StreamdownContextType['controls']): boolean {
  return typeof controls === 'boolean' ? controls : controls.code !== false;
}

/**
 * Fenced code block of the Streamdown renderer, drawn in Streamdown's own
 * chrome: `CodeBlock` supplies the container, language header, sticky actions
 * bar, line numbers, max-height scrolling and the highlighted body (through
 * `plugins.code`, our shiki core — see shikiCodePlugin). Our Pyodide "Ausführen"
 * button and the collapse toggle for spreadsheet scripts sit in that actions
 * bar next to Streamdown's copy and download buttons, which `controls.code`
 * switches on and off exactly as upstream does.
 *
 * ```chart and ```mermaid keep their own renderers (recharts, beautiful-mermaid)
 * — the mermaid diagram lives in the same container/header pair so the two
 * block kinds line up. Execution logic is shared with the legacy ChatCodeBlock
 * via codeBlockExecution.
 */
export function StreamdownCodeBlock({ code, language }: { code: string; language: string }) {
  const isIncomplete = useIsCodeFenceIncomplete();
  const { controls } = useContext(StreamdownContext);
  const { canRun, isTabularCompute, effectiveLanguage, running, progress, output, runCode } =
    useCodeExecution(code, language);
  // Spreadsheet-compute scripts are collapsed by default: the user cares about
  // the result (output card + answer text), not the generated pandas code.
  const [codeExpanded, setCodeExpanded] = useState(false);
  // A malformed ```chart payload falls back to the normal code view.
  const chart = useMemo(() => (language === 'chart' ? parseChart(code) : null), [language, code]);

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

  if (language === 'mermaid') {
    return (
      <CodeBlockContainer language="mermaid" isIncomplete={isIncomplete}>
        <CodeBlockHeader language="mermaid" />
        <div className="rounded-md border border-border bg-background">
          <MermaidDiagram code={code} />
        </div>
      </CodeBlockContainer>
    );
  }

  const showControls = codeControlsEnabled(controls);
  const hasActions = isTabularCompute || canRun || showControls;
  const showCode = !isTabularCompute || codeExpanded;

  return (
    <>
      <CodeBlock
        code={code}
        language={effectiveLanguage}
        isIncomplete={isIncomplete}
        // `className` lands on the body only; the header + actions stay visible
        // while a collapsed spreadsheet script hides its source.
        className={showCode ? undefined : 'hidden'}
      >
        {hasActions ? (
          <>
            {isTabularCompute && (
              <button
                type="button"
                onClick={() => setCodeExpanded((v) => !v)}
                className={ACTION_BUTTON}
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
                type="button"
                onClick={() => void runCode()}
                disabled={running}
                className={ACTION_BUTTON}
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
            {showControls && <CodeBlockDownloadButton />}
            {showControls && <CodeBlockCopyButton />}
          </>
        ) : undefined}
      </CodeBlock>

      {(output || running) && (
        <div className="-mt-2 mb-4 rounded-xl border border-border bg-sidebar px-2 py-1 text-sm">
          {output ? (
            <CodeOutput output={output} className="px-2 py-1" />
          ) : (
            <div className="px-2 py-1 text-xs text-muted-foreground">{progress}</div>
          )}
        </div>
      )}
    </>
  );
}

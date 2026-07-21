'use client';

import { memo, useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Loader2, TriangleAlert } from 'lucide-react';

import { highlightCode } from '../../lib/shikiHighlight';

interface RunPythonToolUIProps {
  args: Record<string, unknown>;
  result?: unknown;
}

/**
 * Card for the run_python client tool (run-then-answer spreadsheet compute).
 * The script is collapsed by default — only the status line is visible; the
 * numeric result renders via the separate "Berechnung" card (compute event)
 * and the answer text. "Code anzeigen" reveals the generated pandas code.
 */
export const RunPythonToolUI = memo(function RunPythonToolUI({
  args,
  result,
}: RunPythonToolUIProps) {
  const [expanded, setExpanded] = useState(false);
  const [html, setHtml] = useState<string | null>(null);

  const code = typeof args?.code === 'string' ? args.code : '';
  const error =
    result != null && typeof result === 'object' && 'error' in result
      ? String((result as { error: unknown }).error)
      : null;
  const done = result !== undefined;

  useEffect(() => {
    if (!expanded || !code || html) return;
    let active = true;
    highlightCode(code, 'python')
      .then((r) => {
        if (active) setHtml(r);
      })
      .catch(() => {
        /* fall back to the plain <pre> below */
      });
    return () => {
      active = false;
    };
  }, [expanded, code, html]);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-card text-sm">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {!done ? (
            <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-primary" />
          ) : error ? (
            <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
          ) : (
            <Check className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
          )}
          <span className="font-medium text-foreground">Tabellen-Berechnung</span>
          <span className="truncate text-foreground-muted">
            {!done ? 'wird ausgeführt…' : error ? 'fehlgeschlagen' : 'abgeschlossen'}
          </span>
        </div>
        {code && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground-muted hover:bg-primary/10 hover:text-foreground"
            aria-expanded={expanded}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {expanded ? 'Code verbergen' : 'Code anzeigen'}
          </button>
        )}
      </div>

      {error && (
        <div className="border-t border-border/60 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
          {error}
        </div>
      )}

      {expanded &&
        code &&
        (html ? (
          <div
            className="overflow-x-auto border-t border-border/60 bg-code-block-bg p-3 text-xs [&_pre]:!m-0 [&_pre]:!bg-transparent"
            // eslint-disable-next-line react/no-danger
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <pre className="overflow-x-auto border-t border-border/60 bg-code-block-bg p-3 text-xs text-code-block-fg">
            <code>{code}</code>
          </pre>
        ))}
    </div>
  );
});

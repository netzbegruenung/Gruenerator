'use client';

import { Check, ChevronRight, Loader2, Plug, X } from 'lucide-react';
import { memo, useId, useState } from 'react';

interface McpToolUIProps {
  args: Record<string, unknown>;
  result?: unknown;
}

/**
 * Step card for a single external MCP tool call (@notion/@brevo …). The
 * collapsed pill shows server/tool + status (spinner/check/✗), matching the
 * old behavior; once the call finishes it becomes expandable, revealing the
 * raw request args and result — the tool output is still folded into the
 * answer prose (mcpToolContext) too, this is a structured detail view, not a
 * replacement for it.
 */
export const McpToolUI = memo(function McpToolUI({ args, result }: McpToolUIProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const detailsId = useId();
  const server = typeof args?.server === 'string' ? args.server : 'MCP';
  const tool = typeof args?.tool === 'string' ? args.tool : '';
  const done = result !== undefined;
  const ok =
    done && result != null && typeof result === 'object' && 'ok' in result
      ? (result as { ok?: boolean }).ok !== false
      : done;

  const { server: _server, tool: _tool, ...callArgs } = args ?? {};
  const hasCallArgs = Object.keys(callArgs).length > 0;

  return (
    <div className="my-1.5 text-xs">
      {/* While in flight the pill stays focusable (`aria-disabled`, not
          `disabled` — a disabled button drops out of the tab order) and the
          click is a no-op; screen readers still get the "läuft" state. */}
      <button
        onClick={() => done && setIsExpanded(!isExpanded)}
        aria-disabled={!done}
        aria-expanded={done ? isExpanded : false}
        aria-controls={detailsId}
        className={`inline-flex items-center gap-2 rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure px-3 py-1.5 transition-colors ${
          done ? 'hover:bg-primary/5 cursor-pointer' : ''
        }`}
      >
        <Plug className="w-3.5 h-3.5 text-primary dark:text-primary-400" />
        <span className="font-semibold text-foreground-heading">{server}</span>
        {tool && <span className="font-mono text-grey-500">{tool}</span>}
        {!done ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-grey-400" />
        ) : ok ? (
          <Check className="w-3.5 h-3.5 text-primary dark:text-primary-400" />
        ) : (
          <X className="w-3.5 h-3.5 text-[var(--error-red)]" />
        )}
        {done && (
          <ChevronRight
            className={`w-3 h-3 text-foreground-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        )}
      </button>

      {/* Always in the DOM so aria-controls never points at a missing id. */}
      <div id={detailsId} hidden={!(isExpanded && done)}>
        {isExpanded && done && (
          <div className="mt-2 ml-2 space-y-2 border-l-2 border-primary/20 pl-3">
            {hasCallArgs && (
              <div>
                <div className="mb-1 font-medium text-foreground-muted">Anfrage</div>
                <pre className="overflow-x-auto rounded-lg bg-surface px-2 py-1.5 font-mono text-[11px] text-foreground whitespace-pre-wrap break-words">
                  {JSON.stringify(callArgs, null, 2)}
                </pre>
              </div>
            )}
            <div>
              <div className="mb-1 font-medium text-foreground-muted">Ergebnis</div>
              <pre className="overflow-x-auto rounded-lg bg-surface px-2 py-1.5 font-mono text-[11px] text-foreground whitespace-pre-wrap break-words">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

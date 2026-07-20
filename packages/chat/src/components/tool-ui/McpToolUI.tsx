'use client';

import { memo } from 'react';
import { Check, Loader2, Plug, X } from 'lucide-react';

interface McpToolUIProps {
  args: Record<string, unknown>;
  result?: unknown;
}

/**
 * Compact step card for a single external MCP tool call (@notion/@brevo …).
 * The tool output itself is folded into the answer (mcpToolContext); this card
 * only shows that the server's tool ran and whether it succeeded.
 */
export const McpToolUI = memo(function McpToolUI({ args, result }: McpToolUIProps) {
  const server = typeof args?.server === 'string' ? args.server : 'MCP';
  const tool = typeof args?.tool === 'string' ? args.tool : '';
  const done = result !== undefined;
  const ok =
    done && result != null && typeof result === 'object' && 'ok' in result
      ? (result as { ok?: boolean }).ok !== false
      : done;

  return (
    <div className="my-1.5 inline-flex items-center gap-2 rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure px-3 py-1.5 text-xs">
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
    </div>
  );
});

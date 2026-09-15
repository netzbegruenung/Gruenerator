/**
 * Vendored from the assistant-ui Elements registry (@assistant-ui/elements-tool-error),
 * adapted at three points. Re-syncing must re-apply all three:
 *   1. imports go through ./_adapter (no "@/" alias here);
 *   2. German copy — this string is user-facing product text;
 *   3. `attempt` / `maxAttempts` / `onRetry` / `onSkip` are DROPPED. The agentic
 *      loop retries model-driven: a failed tool's `{error}` goes back to the
 *      model, which chooses again (wrapTools.ts). There is no client-side retry
 *      or skip, so those controls would be buttons that do nothing, and the
 *      counter would be a number we do not have. See PR B in the plan.
 */
'use client';

import { AlertCircleIcon } from 'lucide-react';

import { cn } from './_adapter';
import { field, mono, paper } from './surfaces';

export interface ToolErrorProps {
  /** The tool's display name — never the raw wire name. */
  name: string;
  /** What the call was about (the query chip), when the tool has one. */
  target?: string | null;
  /** The failure text, as the backend reported it. */
  message: string;
  className?: string;
}

export function ToolError({ name, target, message, className }: ToolErrorProps) {
  return (
    <div
      data-slot="tool-error"
      className={cn(paper, 'flex w-full flex-col gap-2.5 rounded-2xl p-3', className)}
    >
      <div className="flex items-center gap-2">
        <AlertCircleIcon className="text-destructive size-3.5 shrink-0" />
        <span className="text-foreground/80 text-[13px] font-medium">{name}</span>
        {target && (
          <span className="text-foreground/55 min-w-0 flex-1 truncate text-xs">{target}</span>
        )}
        <span className={cn(mono, 'text-foreground/30 ms-auto shrink-0')}>fehlgeschlagen</span>
      </div>
      <div
        className={cn(
          field,
          'text-destructive rounded-xl px-3 py-2 font-mono text-[11px] leading-relaxed'
        )}
      >
        {message}
      </div>
    </div>
  );
}

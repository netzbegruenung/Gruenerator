/**
 * Vendored from the assistant-ui Elements registry (@assistant-ui/elements-tool-call),
 * adapted at four points. Re-syncing must re-apply all four:
 *   1. imports go through ./_adapter (no "@/" alias here);
 *   2. the chevron reads Radix's data-[state=open], not Base UI's data-open;
 *   3. `request: string` / `result: string` are REPLACED by `children` +
 *      `status`. Upstream renders raw JSON; we render typed view-models
 *      (ToolResultRenderer). Taking upstream verbatim would be a regression.
 *   4. an `icon` slot was added; upstream has none;
 *   5. `running: boolean` is replaced by `outcome: ToolOutcome`. Upstream shows
 *      a green CheckIcon whenever the call is not running, so a FAILED tool got
 *      a success tick. The two props are not independent — `running` is derived
 *      from `outcome`, so "running and failed" cannot be expressed.
 */
'use client';

import { AlertCircleIcon, CheckIcon, ChevronRightIcon } from 'lucide-react';
import { type ReactNode } from 'react';

import { type ToolOutcome } from '../../../lib/toolResults';

import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from './_adapter';
import { collapsePanel, field, mono, ShimmerLabel, SwapLabel } from './surfaces';

export interface ToolCallProps {
  /**
   * Leading tool glyph. A fourth deviation from upstream, which has no icon
   * slot: a tool is recognised by its icon here, and native maps the same
   * shared `iconKey`, so dropping it would desync the two platforms.
   */
  icon?: ReactNode;
  /** Resting label, shown once the call has settled. */
  label: string;
  /** Present-tense label, shimmered while `running`. */
  activeLabel: string;
  /** The call's subject, shown as a chip. Omitted when the tool has none. */
  query?: string | null;
  /** Running, settled-ok, or failed. Drives the shimmer AND the trailing glyph. */
  outcome: ToolOutcome;
  /** Trailing chips: result count, confidence, the one-line outcome. */
  status?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The disclosure body. Upstream takes `request`/`result` as STRINGS and
   * renders raw JSON; we pass our typed view-model renderers instead, which is
   * the one deviation that must survive every re-sync — stringifying here would
   * regress citation lists, link previews and person cards to a JSON dump.
   */
  children?: ReactNode;
  className?: string;
}

export function ToolCall({
  icon,
  label,
  activeLabel,
  query,
  outcome,
  status,
  open,
  onOpenChange,
  children,
  className,
}: ToolCallProps) {
  const running = outcome === 'running';
  return (
    <Collapsible
      data-slot="tool-call"
      open={open}
      onOpenChange={onOpenChange}
      className={cn('w-full max-w-sm', className)}
    >
      <CollapsibleTrigger className="group/trigger text-foreground/55 hover:text-foreground/90 flex items-center gap-2 rounded-md py-1 text-[13.5px] transition-colors outline-none">
        <ChevronRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[state=open]/trigger:rotate-90 motion-reduce:transition-none" />
        {icon && <span className="flex shrink-0 items-center">{icon}</span>}
        <SwapLabel active={running ? 0 : 1} className="text-start">
          <ShimmerLabel active={running} className="relative inline-block leading-none">
            {activeLabel}
          </ShimmerLabel>
          <>{label}</>
        </SwapLabel>
        {query && (
          <span
            className={cn(
              mono,
              'bg-foreground/[0.06] text-foreground/70 max-w-[10rem] truncate rounded-md px-1.5 py-0.5 sm:max-w-[16rem]'
            )}
          >
            {query}
          </span>
        )}
        {status && <span className="flex items-center gap-1.5">{status}</span>}
        <span className="ms-auto flex w-4 items-center justify-end">
          {outcome === 'ok' && (
            <CheckIcon className="fade-in zoom-in-90 animate-in size-3.5 text-emerald-500 duration-200" />
          )}
          {outcome === 'error' && (
            <AlertCircleIcon className="fade-in zoom-in-90 animate-in text-destructive size-3.5 duration-200" />
          )}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className={cn(collapsePanel, 'outline-none')}>
        <div className={cn(field, 'mt-2 overflow-hidden rounded-2xl px-3.5 py-2.5 text-xs')}>
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

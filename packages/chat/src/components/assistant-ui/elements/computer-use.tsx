/**
 * Vendored from the assistant-ui Elements registry (@assistant-ui/elements-computer-use,
 * https://r.assistant-ui.com/elements-computer-use.json), adapted at four points.
 * Re-syncing must re-apply all four:
 *   1. imports go through ./_adapter (no "@/" alias here); `React.ReactNode`
 *      is imported as `ReactNode` instead of read off the global namespace;
 *   2. the cursor and its trail are the Gruenerator primary, not upstream blue
 *      (same deviation as `live` in ./surfaces);
 *   3. the trail dots' opacity transition also stops under
 *      `prefers-reduced-motion` — upstream only guards the cursor's;
 *   4. the decorative window dots are `aria-hidden` on their wrapper, so the
 *      wrapper is not an empty, unnamed node in the accessibility tree.
 */
'use client';

import { MousePointer2Icon } from 'lucide-react';
import { type ComponentProps, type ReactNode } from 'react';

import { at, indexIn } from '../utils/range';

import { cn } from './_adapter';
import { field, mono, paper } from './surfaces';

export interface ComputerStep {
  id: string;
  action: string;
  target: string;
  /** Share of the screen's width, 0–100. */
  x: number;
  /** Share of the screen's height, 0–100. */
  y: number;
}

export function ComputerUse({
  url,
  steps,
  activeIndex,
  children,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'url' | 'steps' | 'activeIndex' | 'children'> & {
  url: string;
  steps: readonly ComputerStep[];
  activeIndex: number;
  children: ReactNode;
}) {
  const index = indexIn(steps, activeIndex);
  const active = at(steps, index);
  const trail = steps.slice(Math.max(0, index - 2), index + 1);

  return (
    <div
      data-slot="computer-use"
      className={cn(paper, 'flex w-full max-w-md flex-col overflow-hidden rounded-2xl', className)}
      {...props}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <span aria-hidden className="flex shrink-0 gap-1">
          {['bg-red-500/50', 'bg-amber-500/50', 'bg-emerald-500/50'].map((tint) => (
            <span key={tint} className={cn('size-2 rounded-full', tint)} />
          ))}
        </span>
        <span
          className={cn(
            field,
            mono,
            'text-muted-foreground min-w-0 flex-1 truncate rounded-full px-2.5 py-1'
          )}
        >
          {url}
        </span>
      </div>

      <div className="border-foreground/[0.07] relative min-h-[8.5rem] overflow-hidden border-t">
        {children}

        {trail.map((step, i) => (
          <span
            key={step.id}
            aria-hidden
            className="pointer-events-none absolute size-2 rounded-full bg-primary transition-opacity duration-300 motion-reduce:transition-none"
            style={{
              left: `${step.x}%`,
              top: `${step.y}%`,
              opacity: 0.18 * (i + 1),
            }}
          />
        ))}

        {active && (
          <MousePointer2Icon
            aria-hidden
            className="pointer-events-none absolute size-4 fill-primary text-primary transition-[left,top] duration-500 ease-out motion-reduce:transition-none"
            style={{ left: `${active.x}%`, top: `${active.y}%` }}
          />
        )}
      </div>

      {active && (
        <div className="border-foreground/[0.07] flex items-center gap-2 border-t px-3.5 py-2">
          <span className={cn(mono, 'text-muted-foreground shrink-0')}>{active.action}</span>
          <span className="text-foreground/80 min-w-0 flex-1 truncate text-[13px]">
            {active.target}
          </span>
          <span className={cn(mono, 'text-muted-foreground shrink-0 tabular-nums')}>
            {index + 1}/{steps.length}
          </span>
        </div>
      )}
    </div>
  );
}

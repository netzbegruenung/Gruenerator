/**
 * Vendored from the assistant-ui Elements registry
 * (@assistant-ui/elements-conversation-search). EIGHT deviations — re-syncing
 * must re-apply all of them:
 *   1. imports go through ./_adapter (no "@/" alias here);
 *   2. German strings and aria-labels;
 *   3. muted tones re-tokenized off `text-foreground/NN`, which composites to
 *      ~2:1 in light mode, and the amber highlight replaced by opaque themed
 *      vars — `::highlight()` takes no Tailwind classes, so the body colour has
 *      to be a CSS var anyway, and upstream's `bg-amber-400/35` sits at 1.19:1
 *      against a white page (see docs/CLAUDE-a11y.md);
 *   4. a close button, so a mouse user is not trapped in an Escape-only bar;
 *   5. the step buttons are disabled at zero hits instead of silently doing
 *      nothing;
 *   6. `onKeyDown` and `inputRef` are forwarded to the input — Enter/Escape and
 *      re-focusing on a second Cmd+F both need it;
 *   7. the minimap rail is SPLIT OUT as ConversationSearchRail. Upstream nests
 *      it as a flex sibling of the pill, where it is only as tall as the pill —
 *      a "where in the scroll" indicator the height of one control says
 *      nothing. The consumer places it along the actual scroll box instead;
 *   8. a `status` line for the screen-reader announcement lives in the consumer,
 *      not here.
 */
'use client';

import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from 'lucide-react';

import { cn } from './_adapter';
import { field, ghostButton, mono, paper } from './surfaces';

import type { ComponentProps, KeyboardEvent, Ref } from 'react';

export interface SearchHit {
  id: string;
  before: string;
  match: string;
  after: string;
  /** 0-100 down the scroll box; consumed by ConversationSearchRail. */
  position: number;
}

export function ConversationSearch({
  query,
  hits,
  activeIndex,
  inputRef,
  onQueryChange,
  onStep,
  onClose,
  onInputKeyDown,
  className,
  ...props
}: Omit<
  ComponentProps<'div'>,
  'children' | 'query' | 'hits' | 'activeIndex' | 'onQueryChange' | 'onStep'
> & {
  query: string;
  hits: readonly SearchHit[];
  activeIndex: number;
  inputRef?: Ref<HTMLInputElement>;
  onQueryChange?: (query: string) => void;
  onStep?: (delta: number) => void;
  onClose?: () => void;
  onInputKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const index = hits.length === 0 ? -1 : Math.min(Math.max(activeIndex, 0), hits.length - 1);
  const active = index === -1 ? undefined : hits[index];
  const empty = hits.length === 0;

  return (
    <div
      data-slot="conversation-search"
      className={cn('flex w-full max-w-sm flex-col gap-2', className)}
      {...props}
    >
      <div className={cn(paper, 'flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-3')}>
        <SearchIcon className="size-3.5 shrink-0 text-foreground-muted" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Im Chat suchen"
          aria-label="Im Chat suchen"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-foreground-muted"
        />
        <span
          className={cn(mono, 'shrink-0 tabular-nums text-foreground-muted')}
          aria-hidden="true"
        >
          {empty ? '0' : `${index + 1}/${hits.length}`}
        </span>
        <button
          type="button"
          aria-label="Vorheriger Treffer"
          disabled={empty}
          onClick={() => onStep?.(-1)}
          className={cn(ghostButton, 'size-6 shrink-0 text-foreground-muted hover:text-foreground')}
        >
          <ChevronUpIcon className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Nächster Treffer"
          disabled={empty}
          onClick={() => onStep?.(1)}
          className={cn(ghostButton, 'size-6 shrink-0 text-foreground-muted hover:text-foreground')}
        >
          <ChevronDownIcon className="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Suche schließen"
          onClick={() => onClose?.()}
          className={cn(ghostButton, 'size-6 shrink-0 text-foreground-muted hover:text-foreground')}
        >
          <XIcon className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {active && (
        <div
          className={cn(
            field,
            'fade-in animate-in rounded-xl px-3 py-2 text-xs leading-relaxed duration-200'
          )}
          aria-hidden="true"
        >
          <span className="text-foreground-muted">{active.before}</span>
          <span className="rounded bg-[var(--color-search-hit-active)] px-0.5 text-[var(--color-search-hit-foreground)]">
            {active.match}
          </span>
          <span className="text-foreground-muted">{active.after}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Where the hits sit in the scroll box. Purely decorative — it restates the
 * counter — so it is hidden from the accessibility tree, and the consumer gives
 * it the height of the box it describes.
 */
export function ConversationSearchRail({
  hits,
  activeIndex,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'children' | 'hits' | 'activeIndex'> & {
  hits: readonly SearchHit[];
  activeIndex: number;
}) {
  const index = hits.length === 0 ? -1 : Math.min(Math.max(activeIndex, 0), hits.length - 1);

  return (
    <div
      aria-hidden="true"
      className={cn('relative w-1.5 rounded-full bg-foreground/[0.04]', className)}
      {...props}
    >
      {hits.map((hit, i) => (
        <span
          key={hit.id}
          className={cn(
            'absolute inset-x-0 h-1 rounded-full transition-colors duration-200',
            i === index ? 'bg-[var(--color-search-hit-active)]' : 'bg-[var(--color-search-hit)]'
          )}
          style={{ top: `${hit.position}%` }}
        />
      ))}
    </div>
  );
}

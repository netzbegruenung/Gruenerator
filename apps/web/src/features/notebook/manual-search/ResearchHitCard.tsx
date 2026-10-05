import { formatResearchHitCount } from '@gruenerator/shared/utils';
import { Badge } from '@gruenerator/ui';
import { type JSX, type MouseEvent } from 'react';
import rehypeRaw from 'rehype-raw';

import { Markdown } from '../../../components/common/Markdown/Markdown';
import { NOTEBOOK_SNIPPET_MARKS } from '../notebookTheme';

import { type ResearchResult } from './useResearch';

import type { Components } from 'react-markdown';

import { cn } from '@/utils/cn';

export type ResearchView = 'grid' | 'list';

export function formatPublishedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

// Inline-friendly component map for search snippets: demote h1–h6 to bold
// spans (a header rendered as h1 inside a 200-char teaser is visually absurd),
// collapse horizontal rules to a soft separator, keep paragraphs as spans so
// the snippet stays inline.
const SNIPPET_MARKDOWN_COMPONENTS: Partial<Components> = {
  h1: ({ children }): JSX.Element => <span className="font-semibold">{children}</span>,
  h2: ({ children }): JSX.Element => <span className="font-semibold">{children}</span>,
  h3: ({ children }): JSX.Element => <span className="font-semibold">{children}</span>,
  h4: ({ children }): JSX.Element => <span className="font-semibold">{children}</span>,
  h5: ({ children }): JSX.Element => <span className="font-semibold">{children}</span>,
  h6: ({ children }): JSX.Element => <span className="font-semibold">{children}</span>,
  hr: (): JSX.Element => <span className="mx-1 text-grey-400"> · </span>,
  // The card holds the snippet in a <p>; a block list there is invalid DOM.
  ol: ({ children }): JSX.Element => <span>{children}</span>,
  ul: ({ children }): JSX.Element => <span>{children}</span>,
  li: ({ children }): JSX.Element => <span className="before:content-['·_']"> {children}</span>,
};

const SNIPPET_REHYPE_PLUGINS = [rehypeRaw];

const CARD =
  'relative flex flex-col rounded-xl border border-grey-200 bg-background transition-[box-shadow,border-color] hover:border-[#F2A9CE] hover:shadow-md focus-within:border-[#F2A9CE] dark:border-grey-700 dark:hover:border-[#7A3A5A]';
const TITLE = 'm-0 font-[Raleway,sans-serif] font-bold leading-snug text-foreground-heading';
const SNIPPET = cn(
  'm-0 text-sm leading-relaxed text-grey-600 dark:text-grey-300',
  NOTEBOOK_SNIPPET_MARKS
);
const META = 'text-[0.8125rem] text-grey-600 dark:text-grey-400';
/** The title's target stretches over the card, so the card is one target. */
const STRETCHED_TITLE =
  "text-inherit no-underline after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:underline focus-visible:outline-none";

/** A plain primary click — modified clicks keep the link's own behaviour
 *  (new tab, new window), so the source stays one gesture away. */
function isPlainClick(e: MouseEvent<HTMLAnchorElement>) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

/**
 * One research hit. The title's link stretches over the whole card
 * (`after:inset-0`), so the card opens the source without being a button
 * around a link — keyboard users meet each hit once. With `onOpen`, a plain
 * click opens the hit in the reader instead of the source.
 */
export function ResearchHitCard({
  result,
  view,
  onOpen,
}: {
  result: ResearchResult;
  view: ResearchView;
  onOpen?: (() => void) | undefined;
}) {
  // A Landesverband document carries its kind and origin; other collections
  // fall back to the collection they came from.
  const kind = result.content_type_label ?? result.collection_name ?? null;
  const origin = result.source_name ?? (result.content_type_label ? result.collection_name : null);
  const date = result.published_at ? formatPublishedDate(result.published_at) : null;
  const hits = formatResearchHitCount(result.term_chunk_count, result.chunk_count);

  const title = result.source_url ? (
    <a
      href={result.source_url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={
        onOpen
          ? (e) => {
              if (!isPlainClick(e)) return;
              e.preventDefault();
              onOpen();
            }
          : undefined
      }
      className={STRETCHED_TITLE}
    >
      {result.title}
    </a>
  ) : onOpen ? (
    // An uploaded document has no URL — it opens in the reader only.
    <button
      type="button"
      onClick={onOpen}
      className={cn(STRETCHED_TITLE, 'cursor-pointer bg-transparent p-0 text-left font-[inherit]')}
    >
      {result.title}
    </button>
  ) : (
    result.title
  );

  const snippet = (
    <Markdown
      inline
      rehypePlugins={SNIPPET_REHYPE_PLUGINS}
      components={SNIPPET_MARKDOWN_COMPONENTS}
    >
      {result.relevant_content ?? ''}
    </Markdown>
  );

  const kindBadge = kind ? (
    <Badge variant="outline" className="font-medium">
      {kind}
    </Badge>
  ) : null;

  if (view === 'list') {
    return (
      <article className={cn(CARD, 'gap-1.5 px-4 py-3.5 sm:px-5 sm:py-4')}>
        <div className={cn(META, 'flex flex-wrap items-center gap-x-2 gap-y-1')}>
          {kindBadge}
          <span>{[origin, date].filter(Boolean).join(' · ')}</span>
        </div>
        <h3 className={cn(TITLE, 'text-base [text-wrap:pretty] sm:text-lg')}>{title}</h3>
        <p className={cn(SNIPPET, 'line-clamp-2')}>{snippet}</p>
      </article>
    );
  }

  return (
    <article className={cn(CARD, 'h-full gap-3 p-4 sm:p-5')}>
      <div className="flex items-center justify-between gap-2">
        {kindBadge ?? <span />}
        {date && <span className={META}>{date}</span>}
      </div>
      <h3 className={cn(TITLE, 'line-clamp-3 text-[1.0625rem]')}>{title}</h3>
      <p className={cn(SNIPPET, 'line-clamp-4 flex-1')}>{snippet}</p>
      <div
        className={cn(
          META,
          'flex items-center justify-between gap-3 border-t border-grey-200 pt-3 dark:border-grey-700'
        )}
      >
        <span className="min-w-0 truncate">{origin ?? ''}</span>
        <span className="shrink-0">{hits}</span>
      </div>
    </article>
  );
}

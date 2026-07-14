import { type JSX } from 'react';
import rehypeRaw from 'rehype-raw';

import { Markdown } from '../../../components/common/Markdown/Markdown';

import { type ResearchResult } from './useResearch';

import type { Components } from 'react-markdown';

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
};

const SNIPPET_REHYPE_PLUGINS = [rehypeRaw];

/** Map a research hit to `IndexCard` props — shared by the manual-search tab and
 *  the omni composer's inline results so both surfaces render identically. */
export function resultToCardProps(result: ResearchResult) {
  const similarityPercent = Math.round(result.similarity_score * 100);
  const tags = result.collection_name ? [result.collection_name] : [];
  const chunkLabel =
    result.chunk_count === 1 ? '1 Textabschnitt' : `${result.chunk_count} Textabschnitte`;

  const metaParts = [`${chunkLabel} · ${similarityPercent}% Relevanz`];
  if (result.published_at) metaParts.push(formatPublishedDate(result.published_at));

  return {
    title: result.title,
    description: (
      <Markdown
        inline
        rehypePlugins={SNIPPET_REHYPE_PLUGINS}
        components={SNIPPET_MARKDOWN_COMPONENTS}
      >
        {result.relevant_content ?? ''}
      </Markdown>
    ),
    tags,
    meta: (
      <div className="flex w-full items-center justify-between">
        <span className="text-xs text-grey-500">{metaParts.join(' · ')}</span>
        {result.source_url && (
          <a
            href={result.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary-500 hover:underline"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            Quelle öffnen
          </a>
        )}
      </div>
    ),
    onClick: result.source_url
      ? () => window.open(result.source_url!, '_blank', 'noopener,noreferrer')
      : undefined,
  };
}

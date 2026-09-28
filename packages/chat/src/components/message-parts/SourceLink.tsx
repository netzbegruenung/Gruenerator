'use client';

import { memo, type ReactNode } from 'react';

import { useCitationContext } from '../../context/CitationContext';
import { useCitationPanel } from '../../context/CitationPanelContext';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { sanitizeHref } from '../tool-ui/shared/media/sanitize-href';

import { toPanelSource } from './CitationPopover';

const LINK_CLASS =
  'text-primary underline hover:text-primary-dark break-words [overflow-wrap:anywhere]';

/**
 * Renders the `sourcelink` element that `remarkSourceLinks` builds from
 * `[Titel](quelle:N)`: the title, linked to the document behind citation N.
 *
 * Where it leads depends on what the citation can open, best first:
 * 1. the host's document reader — system documents with a URL
 *    (`readerCollectionId`) and the user's own documents (`readerDocument`),
 *    both set by the API only where the reader can read;
 * 2. the citation panel — notebook chunks (`documentId` + `collectionId` +
 *    `chunkIndex`), the same target as the badge's "Im Dokument lesen";
 * 3. the original URL in a new tab;
 * 4. nothing: the title stays plain text.
 *
 * While streaming, citations only arrive at `done` — until then the title is
 * plain text too, the same way the badge shows a numberless dot.
 */
export const SourceLink = memo(function SourceLink({
  n,
  children,
}: {
  n?: string | number;
  children?: ReactNode;
}) {
  const { citations } = useCitationContext();
  const citationPanel = useCitationPanel();
  const openSourceDocument = useChatConfigStore((s) => s.onOpenSourceDocument);

  const citationId = typeof n === 'string' ? parseInt(n, 10) : n;
  const citation = citations.find((c) => c.id === citationId);
  if (!citation) return <>{children}</>;

  const { readerCollectionId, readerDocument, url, title } = citation;
  const readerTarget =
    readerCollectionId && url
      ? { collectionId: readerCollectionId, sourceUrl: url }
      : readerDocument;
  if (readerTarget && openSourceDocument) {
    return (
      <button
        type="button"
        className={LINK_CLASS}
        onClick={() => openSourceDocument({ ...readerTarget, query: '', title })}
      >
        {children}
      </button>
    );
  }

  const panelSource = toPanelSource(citation);
  if (panelSource) {
    return (
      <button
        type="button"
        className={LINK_CLASS}
        onClick={() => {
          const sources = citations.flatMap((c) => toPanelSource(c) ?? []);
          const index = sources.findIndex((s) => s.citationId === citation.id);
          citationPanel.open(sources, Math.max(0, index));
        }}
      >
        {children}
      </button>
    );
  }

  const href = sanitizeHref(url);
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
        {children}
      </a>
    );
  }

  return <>{children}</>;
});

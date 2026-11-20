/**
 * The target of a chat source link `[Titel](quelle:N)`: the notebook document
 * reader, opened over whatever page the chat is on.
 *
 * Same plumbing as ChatPdfLetterheadExport — a module-level slot rather than a
 * context, because the caller is a plain callback inside GlobalChatProvider's
 * memoized config, and the reader has to open on the CURRENT history entry,
 * which only a mounted component knows.
 */

import { researchDocumentQueryKey } from '@gruenerator/shared/api';
import { Suspense, lazy, useEffect } from 'react';

import { type ReaderTarget } from '../notebook/manual-search/ResearchDocumentReader';
import { useResearchReader } from '../notebook/manual-search/useResearchReader';

// The host is mounted on every page; the reader only after a source click.
const ResearchDocumentReader = lazy(() =>
  import('../notebook/manual-search/ResearchDocumentReader').then((m) => ({
    default: m.ResearchDocumentReader,
  }))
);

let openReader: ((target: ReaderTarget) => void) | null = null;

/** Called from the chat config; a no-op until the host has mounted. */
export function requestChatSourceReader(target: ReaderTarget): void {
  openReader?.(target);
}

export function ChatSourceReaderHost() {
  const reader = useResearchReader('chatSourceReader');

  useEffect(() => {
    openReader = reader.open;
    return () => {
      if (openReader === reader.open) openReader = null;
    };
  });

  if (!reader.target) return null;
  return (
    <Suspense fallback={null}>
      <ResearchDocumentReader
        key={researchDocumentQueryKey(reader.target).join('|')}
        target={reader.target}
        onClose={reader.close}
        chatActions={false}
      />
    </Suspense>
  );
}

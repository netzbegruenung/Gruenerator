/**
 * Der Panel-Abruf muss die documentId URL-kodieren: für gescrapte
 * Systemsammlungen (KommunalWiki, gruene.de, …) IST die documentId die
 * Quell-URL (SearchResultProcessor.ts:39, `r.document_id || sourceUrl`).
 * Unkodiert zerfällt `/api/documents/https://…/chunks` in mehrere
 * Pfadsegmente, und die Express-Route `/:id/chunks` matcht nie — der 404
 * kommt vor jedem Handler (Prod, 03.09.2026).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CitationPanelProvider,
  useCitationPanel,
  type CitationPanelTarget,
} from '../../context/CitationPanelContext';
import { useChatConfigStore } from '../../stores/chatConfigStore';

import { CitationSidePanel } from './CitationSidePanel';

function OpenOnMount({ target }: { target: CitationPanelTarget }) {
  const { open } = useCitationPanel();
  useEffect(() => {
    open(target);
  }, [open, target]);
  return null;
}

function renderPanel(target: CitationPanelTarget) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CitationPanelProvider>
        <OpenOnMount target={target} />
        <CitationSidePanel />
      </CitationPanelProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  useChatConfigStore.getState().configure();
});

describe('CitationSidePanel — Abruf-URL', () => {
  it('kodiert eine URL-förmige documentId als ein Pfadsegment', async () => {
    const documentId = 'https://kommunalwiki.boell.de/index.php/Zusammenarbeit_im_Team';
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            document_id: documentId,
            document_title: 'Zusammenarbeit im Team',
            chunk_count: 1,
            chunks: [{ index: 3, text: 'Der ganze Text des Chunks', tokens: 6 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
    );
    useChatConfigStore.getState().configure({ fetch: fetchMock });

    renderPanel({
      documentId,
      documentTitle: 'Zusammenarbeit im Team',
      chunkIndex: 3,
      collectionId: 'kommunalwiki-system',
      sourceUrl: documentId,
    });

    expect(await screen.findByText('Der ganze Text des Chunks')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/documents/${encodeURIComponent(documentId)}/chunks?collectionId=kommunalwiki-system`,
      expect.objectContaining({ method: 'GET' })
    );
  });
});

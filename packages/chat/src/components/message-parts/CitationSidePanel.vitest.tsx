/**
 * Transportweg der documentId zum Chunk-Abruf. Für gescrapte Systemsammlungen
 * (KommunalWiki, gruene.de, …) IST die documentId die Quell-URL
 * (SearchResultProcessor.ts:39, `r.document_id || sourceUrl`) — und eine URL
 * überlebt den PFAD nicht: der Reverse-Proxy dekodiert %2F und merged
 * Slashes, bevor Express routet (beta, 03.09.2026: kodiert gesendet,
 * `https:/…` kam an, 404 vor jedem Handler). URL-förmige IDs reisen deshalb
 * im Query-String; UUIDs bleiben auf dem bisherigen Pfad.
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

function chunksFetchMock(documentId: string) {
  return vi.fn(
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
}

afterEach(() => {
  useChatConfigStore.getState().configure();
});

describe('CitationSidePanel — Abruf-URL', () => {
  it('transportiert eine URL-förmige documentId im Query-String', async () => {
    const documentId = 'https://kommunalwiki.boell.de/index.php/Zusammenarbeit_im_Team';
    const fetchMock = chunksFetchMock(documentId);
    useChatConfigStore.getState().configure({ fetch: fetchMock });

    renderPanel({
      documentId,
      documentTitle: 'Zusammenarbeit im Team',
      chunkIndex: 3,
      collectionId: 'kommunalwiki-system',
      sourceUrl: documentId,
    });

    expect(await screen.findByText('Der ganze Text des Chunks')).toBeInTheDocument();
    const expectedQuery = new URLSearchParams({
      collectionId: 'kommunalwiki-system',
      documentId,
    }).toString();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/documents/chunks?${expectedQuery}`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('lässt UUID-IDs auf dem bisherigen Pfad', async () => {
    const fetchMock = chunksFetchMock('doc-1');
    useChatConfigStore.getState().configure({ fetch: fetchMock });

    renderPanel({
      documentId: 'doc-1',
      documentTitle: 'Grundsatzprogramm',
      chunkIndex: 0,
      collectionId: 'grundsatz-system',
      sourceUrl: '',
    });

    expect(await screen.findByText('Der ganze Text des Chunks')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/documents/doc-1/chunks?collectionId=grundsatz-system',
      expect.objectContaining({ method: 'GET' })
    );
  });
});

/**
 * Das Panel ist die Belegfläche der App: es behauptet „das ist die Passage, die
 * die Antwort benutzt hat, und hier steht sie im Dokument". Geprüft werden die
 * Aussagen, die dieses Gewicht tragen — die Hervorhebung, die Positionszeile,
 * das Blättern — und der Transportweg der documentId, der zweimal kaputtging.
 *
 * Gerendert wird durchweg die Sheet-Variante: jsdom meldet jede `clientWidth`
 * als 0, `useIsNarrowerThan` sagt also immer „schmal". Die Spalte teilt sich den
 * ganzen Rumpf mit ihr, nur die Rahmung unterscheidet sich.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CitationPanelProvider, useCitationPanel } from '../../context/CitationPanelContext';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { axe } from '../../test-utils';

import { CitationSidePanel } from './CitationSidePanel';

import type { CitationPanelSource } from '../../context/CitationPanelContext';

const CHUNKS = [
  { index: 0, text: 'Vorlauf: worum es im Kapitel geht.', tokens: 8, pageNumber: 13 },
  {
    index: 1,
    text: 'Das lässt sich in Form von informellen Spielregeln machen oder als formelle Geschäftsordnung.',
    tokens: 16,
    pageNumber: 14,
  },
  { index: 2, text: 'Nachlauf: der nächste Abschnitt.', tokens: 6, pageNumber: 15 },
];

function source(over: Partial<CitationPanelSource> = {}): CitationPanelSource {
  return {
    citationId: 1,
    documentId: 'doc-1',
    documentTitle: 'Fraktionshandbuch',
    chunkIndex: 1,
    collectionId: 'coll-1',
    sourceUrl: 'https://example.org/handbuch.pdf',
    citedText: 'informellen Spielregeln machen',
    collectionName: 'Kommunalpolitik',
    ...over,
  };
}

function OpenOnMount({ sources, at }: { sources: CitationPanelSource[]; at: number }) {
  const { open } = useCitationPanel();
  useEffect(() => open(sources, at), [open, sources, at]);
  return null;
}

function Harness({ sources, at = 0 }: { sources: CitationPanelSource[]; at?: number }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <CitationPanelProvider>
        <OpenOnMount sources={sources} at={at} />
        <CitationSidePanel containerRef={{ current: null }} />
      </CitationPanelProvider>
    </QueryClientProvider>
  );
}

function chunksResponse(documentId: string, chunks = CHUNKS) {
  return new Response(
    JSON.stringify({
      success: true,
      document_id: documentId,
      document_title: 'Fraktionshandbuch',
      chunk_count: chunks.length,
      chunks,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  useChatConfigStore.getState().configure({ fetch: async () => chunksResponse('doc-1') });
});

afterEach(() => {
  useChatConfigStore.getState().configure();
});

describe('CitationSidePanel — Darstellung', () => {
  it('markiert die zitierten Worte im Chunk, nicht den ganzen Chunk', async () => {
    render(<Harness sources={[source()]} />);
    const mark = await screen.findByText('informellen Spielregeln machen');
    expect(mark.tagName).toBe('MARK');
  });

  it('sagt, wo im Dokument die Passage steht', async () => {
    render(<Harness sources={[source()]} />);
    // Die API liefert Seitenzahlen; bis hierher wurden sie geholt und verworfen.
    expect(await screen.findByText('Abschnitt 2 von 3 · Seite 14')).toBeInTheDocument();
    expect(screen.getByText('PDF · Kommunalpolitik')).toBeInTheDocument();
  });

  it('trennt die Passage von ihrer Umgebung', async () => {
    render(<Harness sources={[source()]} />);
    expect(await screen.findByText('Zitierte Passage')).toBeInTheDocument();
    expect(screen.getByText('Kontext davor')).toBeInTheDocument();
    expect(screen.getByText('Kontext danach')).toBeInTheDocument();
  });

  it('blättert durch die Quellen einer Antwort, ohne zu schließen', async () => {
    const user = userEvent.setup();
    const sources = [source(), source({ citationId: 2, chunkIndex: 2, citedText: undefined })];
    render(<Harness sources={sources} at={0} />);

    expect(await screen.findByText('Zitat 1 von 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Zurück/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Weiter/ }));

    expect(await screen.findByText('Zitat 2 von 2')).toBeInTheDocument();
    expect(screen.getByText('Abschnitt 3 von 3 · Seite 15')).toBeInTheDocument();
  });

  it('blendet den Blätterfuß bei einer einzigen Quelle aus', async () => {
    render(<Harness sources={[source()]} />);
    await screen.findByText('Zitierte Passage');
    expect(screen.queryByRole('button', { name: /Weiter/ })).not.toBeInTheDocument();
  });

  it('zeigt das Dokument weiter, wenn der zitierte Chunk nach Neu-Indizierung fehlt', async () => {
    render(<Harness sources={[source({ chunkIndex: 99 })]} />);
    expect(await screen.findByText('Originaltext')).toBeInTheDocument();
    expect(screen.queryByText('Zitierte Passage')).not.toBeInTheDocument();
  });

  it('meldet einen fehlgeschlagenen Abruf, statt leer zu bleiben', async () => {
    useChatConfigStore
      .getState()
      .configure({ fetch: async () => new Response(null, { status: 500 }) });
    render(<Harness sources={[source()]} />);
    expect(await screen.findByText('Inhalte konnten nicht geladen werden')).toBeInTheDocument();
  });

  it('hat keine axe-Verstöße', async () => {
    const { baseElement } = render(<Harness sources={[source()]} />);
    await screen.findByText('Zitierte Passage');
    await waitFor(async () => {
      expect(await axe(baseElement)).toHaveNoViolations();
    });
  });
});

/**
 * Transportweg der documentId zum Chunk-Abruf. Für gescrapte Systemsammlungen
 * (KommunalWiki, gruene.de, …) IST die documentId die Quell-URL
 * (SearchResultProcessor.ts:39, `r.document_id || sourceUrl`) — und eine URL
 * überlebt den PFAD nicht: der Reverse-Proxy dekodiert %2F und merged
 * Slashes, bevor Express routet (beta, 03.09.2026: kodiert gesendet,
 * `https:/…` kam an, 404 vor jedem Handler). URL-förmige IDs reisen deshalb
 * im Query-String; UUIDs bleiben auf dem bisherigen Pfad.
 */
describe('CitationSidePanel — Abruf-URL', () => {
  const ONE_CHUNK = [{ index: 3, text: 'Der ganze Text des Chunks', tokens: 6 }];

  it('transportiert eine URL-förmige documentId im Query-String', async () => {
    const documentId = 'https://kommunalwiki.boell.de/index.php/Zusammenarbeit_im_Team';
    const fetchMock = vi.fn(async () => chunksResponse(documentId, ONE_CHUNK));
    useChatConfigStore.getState().configure({ fetch: fetchMock });

    render(
      <Harness
        sources={[
          source({
            documentId,
            documentTitle: 'Zusammenarbeit im Team',
            chunkIndex: 3,
            collectionId: 'kommunalwiki-system',
            sourceUrl: documentId,
            citedText: undefined,
          }),
        ]}
      />
    );

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
    const fetchMock = vi.fn(async () => chunksResponse('doc-1', ONE_CHUNK));
    useChatConfigStore.getState().configure({ fetch: fetchMock });

    render(
      <Harness
        sources={[
          source({
            documentId: 'doc-1',
            documentTitle: 'Grundsatzprogramm',
            chunkIndex: 0,
            collectionId: 'grundsatz-system',
            sourceUrl: '',
            citedText: undefined,
          }),
        ]}
      />
    );

    expect(await screen.findByText('Der ganze Text des Chunks')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/documents/doc-1/chunks?collectionId=grundsatz-system',
      expect.objectContaining({ method: 'GET' })
    );
  });
});

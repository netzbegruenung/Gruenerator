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
import { useEffect, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CitationPanelProvider, useCitationPanel } from '../../context/CitationPanelContext';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { axe } from '../../test-utils';

import {
  CitationSidePanel,
  type CitationOriginalViewer,
  type CitationOriginalViewerProps,
} from './CitationSidePanel';

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

function Harness({
  sources,
  at = 0,
  originalViewer,
}: {
  sources: CitationPanelSource[];
  at?: number;
  originalViewer?: CitationOriginalViewer;
}) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  );
  return (
    <QueryClientProvider client={client}>
      <CitationPanelProvider>
        <OpenOnMount sources={sources} at={at} />
        <CitationSidePanel containerRef={{ current: null }} originalViewer={originalViewer} />
      </CitationPanelProvider>
    </QueryClientProvider>
  );
}

interface TestChunk {
  index: number;
  text: string;
  tokens: number;
  pageNumber?: number;
}

function chunksResponse(
  documentId: string,
  chunks: TestChunk[] = CHUNKS,
  extra: Record<string, unknown> = {}
) {
  return new Response(
    JSON.stringify({
      success: true,
      document_id: documentId,
      document_title: 'Fraktionshandbuch',
      chunk_count: chunks.length,
      chunks,
      ...extra,
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
    expect(await screen.findByText('Seite 14')).toBeInTheDocument();
    expect(screen.getByText('PDF · Kommunalpolitik')).toBeInTheDocument();
    // Die Chunk-Zählung ist eine Indexgröße, keine Angabe für Lesende.
    expect(screen.queryByText(/Abschnitt \d+ von/)).not.toBeInTheDocument();
  });

  it('zeigt das ganze Dokument als einen Text, nur das Zitat markiert', async () => {
    render(<Harness sources={[source()]} />);
    const mark = await screen.findByText('informellen Spielregeln machen');
    const body = mark.closest('[data-document-text]');
    expect(body).toHaveTextContent(CHUNKS[0]!.text);
    expect(body).toHaveTextContent(CHUNKS[2]!.text);
    expect(body?.querySelectorAll('mark')).toHaveLength(1);
    expect(screen.queryByText('Kontext davor')).not.toBeInTheDocument();
    expect(screen.queryByText('Zitierte Passage')).not.toBeInTheDocument();
  });

  it('liest den gespeicherten Volltext und markiert über die Chunk-Offsets', async () => {
    // Der Volltext hat Struktur, die die Chunks nicht tragen (Überschrift,
    // Absätze); der Satz steht zweimal — markiert wird der im zitierten Chunk.
    const fullText =
      '# Kapitel 3\n\nSo regeln wir es.\n\nWir regeln es so: So regeln wir es.\n\nEnde.';
    const second = fullText.lastIndexOf('So regeln wir es.');
    useChatConfigStore.getState().configure({
      fetch: async () =>
        chunksResponse(
          'doc-1',
          [
            { index: 0, text: 'So regeln wir es.', tokens: 4 },
            { index: 1, text: 'Wir regeln es so: So regeln wir es.', tokens: 8 },
          ],
          {
            full_text: fullText,
            chunk_map: [
              { index: 0, charStart: 14, charEnd: 31 },
              { index: 1, charStart: second - 18, charEnd: second + 17 },
            ],
          }
        ),
    });
    render(<Harness sources={[source({ chunkIndex: 1, citedText: 'So regeln wir es.' })]} />);
    const mark = await screen.findByText('So regeln wir es.', { selector: 'mark' });
    // Der zweite Absatz trägt die Marke, der erste mit demselben Satz nicht.
    expect(mark.closest('p')?.textContent).toBe('Wir regeln es so: So regeln wir es.');
    expect(mark.previousSibling?.textContent).toBe('Wir regeln es so: ');
    expect(screen.getAllByText('So regeln wir es.', { selector: 'p' })).toHaveLength(1);
    // Markdown wird gesetzt, nicht als Rohzeile gezeigt.
    expect(screen.getByRole('heading', { name: 'Kapitel 3' })).toBeInTheDocument();
    expect(screen.queryByText(/# Kapitel/)).not.toBeInTheDocument();
  });

  it('liest Gendersterne nicht als Kursivschrift', async () => {
    const fullText = 'Die Kandidat*innen des KV und die Direktkandidat*innen wählen.';
    useChatConfigStore.getState().configure({
      fetch: async () =>
        chunksResponse('doc-1', [{ index: 0, text: fullText, tokens: 9 }], {
          full_text: fullText,
          chunk_map: [{ index: 0, charStart: 0, charEnd: fullText.length }],
        }),
    });
    render(
      <Harness
        sources={[source({ chunkIndex: 0, citedText: 'Direktkandidat*innen', quote: undefined })]}
      />
    );
    const mark = await screen.findByText('Direktkandidat*innen', { selector: 'mark' });
    expect(mark.closest('p')?.textContent).toBe(fullText);
    expect(mark.closest('p')?.querySelector('em')).toBeNull();
  });

  it('setzt Seitenmarken als Trenner und markiert über Absatzgrenzen hinweg', async () => {
    const fullText = '## Seite 1\n\nErster Satz.\n\n## Seite 2\n\nZweiter Satz.';
    useChatConfigStore.getState().configure({
      fetch: async () =>
        chunksResponse('doc-1', [{ index: 0, text: 'Erster Satz. Zweiter Satz.', tokens: 6 }], {
          full_text: fullText,
          chunk_map: [{ index: 0, charStart: 12, charEnd: fullText.length }],
        }),
    });
    render(
      <Harness sources={[source({ chunkIndex: 0, citedText: undefined, quote: undefined })]} />
    );
    expect(await screen.findByText('Seite 2')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Seite 2' })).not.toBeInTheDocument();
    // Der Chunk spannt über den Seitentrenner: eine Marke je Absatz, der Trenner bleibt Trenner.
    const marks = await screen.findAllByText(/Satz\./, { selector: 'mark' });
    expect(marks.map((m) => m.textContent)).toEqual(['Erster Satz.', 'Zweiter Satz.']);
  });

  it('blättert durch die Quellen einer Antwort, ohne zu schließen', async () => {
    const user = userEvent.setup();
    const sources = [source(), source({ citationId: 2, chunkIndex: 2, citedText: undefined })];
    render(<Harness sources={sources} at={0} />);

    expect(await screen.findByText('Zitat 1 von 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Zurück/ })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Weiter/ }));

    expect(await screen.findByText('Zitat 2 von 2')).toBeInTheDocument();
    expect(screen.getByText('Seite 15')).toBeInTheDocument();
  });

  it('blendet den Blätterfuß bei einer einzigen Quelle aus', async () => {
    render(<Harness sources={[source()]} />);
    await screen.findByText('informellen Spielregeln machen');
    expect(screen.queryByRole('button', { name: /Weiter/ })).not.toBeInTheDocument();
  });

  it('zeigt das Dokument weiter, wenn der zitierte Chunk nach Neu-Indizierung fehlt', async () => {
    render(<Harness sources={[source({ chunkIndex: 99, citedText: undefined })]} />);
    expect(await screen.findByText(/Vorlauf: worum es im Kapitel geht/)).toBeInTheDocument();
    expect(document.querySelector('mark')).toBeNull();
    // Auch ohne Hervorhebung bleibt das Dokument gerahmt.
    expect(screen.getByText('Anfang des Dokuments')).toBeInTheDocument();
    expect(screen.getByText('Ende des Dokuments')).toBeInTheDocument();
  });

  it('rahmt das Dokument mit Anfang und Ende, auch wenn die Passage ganz oben sitzt', async () => {
    // Ohne die Rahmung liest sich ein vollständiges kurzes Dokument wie ein
    // abgeschnittenes — genau so entstand der Befund „nur ein Kapitel davor".
    render(<Harness sources={[source({ chunkIndex: 0, citedText: undefined })]} />);
    // Ohne auffindbares Zitat ist der zitierte Chunk selbst markiert.
    const mark = await screen.findByText(CHUNKS[0]!.text, { selector: 'mark' });
    expect(mark).toBeInTheDocument();
    expect(screen.getByText('Anfang des Dokuments')).toBeInTheDocument();
    expect(screen.getByText('Ende des Dokuments')).toBeInTheDocument();
  });

  it('bietet am Dokumentende den Sprung zur vollständigen Quelle an', async () => {
    render(<Harness sources={[source()]} />);
    const link = await screen.findByRole('link', { name: 'Vollständige Quelle öffnen' });
    expect(link).toHaveAttribute('href', 'https://example.org/handbuch.pdf');
  });

  it('lässt den Quellen-Sprung weg, wenn keine URL bekannt ist', async () => {
    render(<Harness sources={[source({ sourceUrl: '' })]} />);
    await screen.findByText('informellen Spielregeln machen');
    expect(
      screen.queryByRole('link', { name: 'Vollständige Quelle öffnen' })
    ).not.toBeInTheDocument();
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
    await screen.findByText('informellen Spielregeln machen');
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

describe('CitationSidePanel — gespeichertes Original', () => {
  it('öffnet das hochgeladene PDF auf der Seite der zitierten Stelle', async () => {
    useChatConfigStore.getState().configure({
      fetch: async () =>
        chunksResponse('doc-1', CHUNKS, {
          has_original: true,
          original_mimetype: 'application/pdf',
        }),
    });
    render(<Harness sources={[source({ sourceUrl: undefined, collectionId: 'nb-1' })]} />);
    const link = await screen.findByRole('link', { name: 'PDF öffnen, Seite 14' });
    expect(link).toHaveAttribute('href', '/api/documents/doc-1/original?notebookId=nb-1#page=14');
    expect(link).toHaveAttribute('target', '_blank');
    // Dateiart und Seite stehen im Knopf, nicht noch einmal daneben.
    expect(screen.getByText('Kommunalpolitik')).toBeInTheDocument();
    expect(screen.queryByText('Seite 14')).not.toBeInTheDocument();
  });

  it('nennt die Dateiart aus dem Titel, wenn der MIME-Typ zu lang ist', async () => {
    useChatConfigStore.getState().configure({
      fetch: async () =>
        chunksResponse('doc-1', [{ index: 1, text: 'Text', tokens: 1 }], {
          has_original: true,
          original_mimetype:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
    });
    render(<Harness sources={[source({ documentTitle: 'Satzung.docx', sourceUrl: undefined })]} />);
    expect(await screen.findByRole('link', { name: 'DOCX öffnen' })).toBeInTheDocument();
  });

  it('zeigt keinen Knopf ohne gespeichertes Original', async () => {
    render(<Harness sources={[source()]} />);
    await screen.findByText('informellen Spielregeln machen');
    const originals = screen
      .queryAllByRole('link')
      .filter((a) => a.getAttribute('href')?.includes('/original'));
    expect(originals).toHaveLength(0);
  });
});

describe('CitationSidePanel — PDF-Ansicht', () => {
  const seen: CitationOriginalViewerProps[] = [];
  function StubViewer(props: CitationOriginalViewerProps) {
    seen.push(props);
    return (
      <div data-testid="pdf-viewer">
        <button type="button" onClick={props.onShowText}>
          zurück zum Text
        </button>
      </div>
    );
  }
  const viewer: CitationOriginalViewer = { component: StubViewer };

  beforeEach(() => {
    seen.length = 0;
    localStorage.clear();
    useChatConfigStore.getState().configure({
      fetch: async () =>
        chunksResponse('doc-1', CHUNKS, {
          has_original: true,
          original_mimetype: 'application/pdf',
        }),
    });
  });

  it('startet im Text und wechselt auf Wunsch zur PDF', async () => {
    const user = userEvent.setup();
    const sources = [
      source({ sourceUrl: undefined, collectionId: 'nb-1' }),
      source({ citationId: 2, documentId: 'doc-2', collectionId: 'nb-1' }),
      source({ citationId: 3, chunkIndex: 2, citedText: undefined, collectionId: 'nb-1' }),
    ];
    render(<Harness sources={sources} originalViewer={viewer} />);

    const pdf = await screen.findByRole('button', { name: 'PDF', pressed: false });
    expect(screen.getByText('informellen Spielregeln machen')).toBeVisible();
    await user.click(pdf);

    expect(await screen.findByTestId('pdf-viewer')).toBeInTheDocument();
    const props = seen.at(-1)!;
    expect(props.url).toBe('/api/documents/doc-1/original?notebookId=nb-1');
    // Only the citations into this document, each with what to search for.
    expect(props.marks).toEqual([
      {
        citationId: 1,
        page: 14,
        texts: ['informellen Spielregeln machen', CHUNKS[1]!.text],
      },
      { citationId: 3, page: 15, texts: [CHUNKS[2]!.text] },
    ]);
    expect(props.activeIndex).toBe(0);
    expect(localStorage.getItem('gruenerator.citationPanel.view')).toBe('pdf');
  });

  it('sucht den Belegsatz vor dem Ausschnitt und markiert ihn auch im Text', async () => {
    const user = userEvent.setup();
    const sources = [
      source({
        sourceUrl: undefined,
        collectionId: 'nb-1',
        quote: 'Das lässt sich in Form von informellen Spielregeln machen',
        citedText: CHUNKS[1]!.text,
      }),
    ];
    render(<Harness sources={sources} originalViewer={viewer} />);

    const mark = await screen.findByText(
      'Das lässt sich in Form von informellen Spielregeln machen'
    );
    expect(mark.tagName).toBe('MARK');

    await user.click(await screen.findByRole('button', { name: 'PDF', pressed: false }));
    await screen.findByTestId('pdf-viewer');
    expect(seen.at(-1)!.marks[0]!.texts).toEqual([
      'Das lässt sich in Form von informellen Spielregeln machen',
      CHUNKS[1]!.text,
    ]);
  });

  it('springt aus der PDF zurück in den Text', async () => {
    const user = userEvent.setup();
    localStorage.setItem('gruenerator.citationPanel.view', 'pdf');
    render(<Harness sources={[source({ sourceUrl: undefined })]} originalViewer={viewer} />);
    await user.click(await screen.findByRole('button', { name: 'zurück zum Text' }));
    expect(screen.queryByTestId('pdf-viewer')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Text', pressed: true })).toBeInTheDocument();
  });

  it('bietet keine PDF-Ansicht für andere Dateiarten', async () => {
    useChatConfigStore.getState().configure({
      fetch: async () =>
        chunksResponse('doc-1', CHUNKS, {
          has_original: true,
          original_mimetype: 'text/plain',
        }),
    });
    render(<Harness sources={[source({ documentTitle: 'notiz.txt' })]} originalViewer={viewer} />);
    await screen.findByText('informellen Spielregeln machen');
    expect(screen.queryByRole('button', { name: 'PDF' })).not.toBeInTheDocument();
  });
});

describe('CitationSidePanel — schmale Fläche', () => {
  // The panel measures the surface it sits in. React attaches the parent's ref
  // only after the child's layout effect, so a first measurement finds `null`;
  // without a retry the panel stayed a 440px column on phones.
  function SurfaceHarness({ sources }: { sources: CitationPanelSource[] }) {
    const [client] = useState(
      () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
    );
    const surfaceRef = useRef<HTMLDivElement>(null);
    return (
      <QueryClientProvider client={client}>
        <CitationPanelProvider>
          <OpenOnMount sources={sources} at={0} />
          <div ref={surfaceRef}>
            <CitationSidePanel containerRef={surfaceRef} />
          </div>
        </CitationPanelProvider>
      </QueryClientProvider>
    );
  }

  it('wird auf einer schmalen Fläche zum Sheet, auch wenn die Fläche später gemessen wird', async () => {
    render(<SurfaceHarness sources={[source()]} />);
    // jsdom reports every clientWidth as 0, i.e. narrower than any threshold.
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});

/**
 * Der Inspektor darf nichts erfinden: ein Feld, das die Nutzlast nicht trägt,
 * erscheint als „nicht gespeichert" — nicht als Leerzeile und nicht als 0.
 * Und ein Chunk unter der Abrufschwelle wird als solcher ausgewiesen, sonst
 * sieht die Person eine Zahl und zieht den falschen Schluss.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders, screen, waitFor } from '../../../test-utils';

import { ChunkInspectorView } from './ChunkInspectorView';

const ENDPOINT = 'http://localhost/api/auth/admin/chunk-inspector/doc-1';

beforeAll(() => {
  // Ohne absolute baseURL löst der Contracts-Client relativ auf und kein
  // MSW-Handler greift (apps/web/CLAUDE-testing.md, „MSW: getting the URL right").
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

function header(over: Record<string, unknown> = {}) {
  return {
    documentId: 'doc-1',
    collection: 'grundsatz-system',
    qdrantCollection: 'grundsatz_documents',
    isSystemCollection: true,
    title: 'Grundsatzprogramm',
    filename: 'grundsatz.pdf',
    sourceUrl: null,
    sourceType: 'program',
    extractionMethod: 'docling',
    extractionMethodOrigin: 'qdrant_payload',
    pageCount: 12,
    chunkCount: 2,
    indexedAt: '2026-08-01T10:00:00.000Z',
    embeddingTitlePrefix: 'Grundsatzprogramm (Präambel)',
    qualityThreshold: 0.4,
    ...over,
  };
}

function chunk(index: number, over: Record<string, unknown> = {}) {
  return {
    index,
    page: 3,
    text: `Chunk ${index} Text`,
    charCount: 13,
    tokenCount: 4,
    qualityScore: 0.72,
    hasTable: false,
    embeddingPresent: true,
    sparsePresent: true,
    ...over,
  };
}

function respondWith(body: Record<string, unknown>, status = 200) {
  server.use(http.get(ENDPOINT, () => HttpResponse.json(body, { status })));
}

describe('ChunkInspectorView', () => {
  it('zeigt Kopfdaten und die Chunk-Zeilen', async () => {
    respondWith({
      success: true,
      header: header(),
      chunks: [chunk(0), chunk(1)],
      nextOffset: null,
    });
    renderWithProviders(<ChunkInspectorView documentId="doc-1" collection="grundsatz-system" />);

    expect(await screen.findByText('Grundsatzprogramm')).toBeInTheDocument();
    expect(screen.getByText('docling')).toBeInTheDocument();
    expect(screen.getByText(/Chunk 0 Text/)).toBeInTheDocument();
    expect(screen.getByText(/Chunk 1 Text/)).toBeInTheDocument();
  });

  it('startet auf der Seite, die initialOffset vorgibt', async () => {
    let requestedOffset: string | null = null;
    server.use(
      http.get(ENDPOINT, ({ request }) => {
        requestedOffset = new URL(request.url).searchParams.get('offset');
        return HttpResponse.json({
          success: true,
          header: header(),
          chunks: [chunk(50)],
          nextOffset: null,
        });
      })
    );
    renderWithProviders(
      <ChunkInspectorView documentId="doc-1" collection="grundsatz-system" initialOffset={50} />
    );

    await screen.findByText(/Chunk 50 Text/);
    expect(requestedOffset).toBe('50');
  });

  it('schreibt „nicht gespeichert" an die Felder, die kein Schreiber füllt', async () => {
    respondWith({
      success: true,
      header: header({
        extractionMethod: null,
        extractionMethodOrigin: 'unknown',
        pageCount: null,
      }),
      chunks: [chunk(0, { qualityScore: null, page: null })],
      nextOffset: null,
    });
    renderWithProviders(<ChunkInspectorView documentId="doc-1" collection="nb-1" />);

    await waitFor(() => {
      expect(screen.getAllByText('nicht gespeichert').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('markiert einen Chunk unter der Abrufschwelle', async () => {
    respondWith({
      success: true,
      header: header({ qualityThreshold: 0.4 }),
      chunks: [chunk(0, { qualityScore: 0.21 })],
      nextOffset: null,
    });
    renderWithProviders(<ChunkInspectorView documentId="doc-1" collection="grundsatz-system" />);

    expect(await screen.findByText('unter Abrufschwelle — nie abrufbar')).toBeInTheDocument();
  });

  it('zeigt einen Leerzustand statt einer leeren Tabelle', async () => {
    respondWith({
      success: true,
      header: header({ chunkCount: 0 }),
      chunks: [],
      nextOffset: null,
    });
    renderWithProviders(<ChunkInspectorView documentId="doc-1" collection="grundsatz-system" />);

    expect(
      await screen.findByText('Zu diesem Dokument liegen keine Chunks vor.')
    ).toBeInTheDocument();
  });

  it('meldet die Server-Meldung bei 404, statt still leer zu bleiben', async () => {
    respondWith({ success: false, message: 'Keine Chunks gefunden.' }, 404);
    renderWithProviders(<ChunkInspectorView documentId="doc-1" collection="grundsatz-system" />);

    expect(await screen.findByText('Keine Chunks gefunden.')).toBeInTheDocument();
  });

  it('meldet fehlenden Zugriff bei 403, statt der Server-Meldung', async () => {
    respondWith({ success: false, message: 'Keine Admin-Berechtigung.' }, 403);
    renderWithProviders(<ChunkInspectorView documentId="doc-1" collection="grundsatz-system" />);

    expect(
      await screen.findByText('Kein Zugriff (Instanz-Admin erforderlich)')
    ).toBeInTheDocument();
  });

  it('hat keine a11y-Verstösse — die Spaltenköpfe sind von Hand gesetzt', async () => {
    respondWith({ success: true, header: header(), chunks: [chunk(0)], nextOffset: null });
    const { container } = renderWithProviders(
      <ChunkInspectorView documentId="doc-1" collection="grundsatz-system" />
    );
    await screen.findByText(/Chunk 0 Text/);

    expect(await axe(container)).toHaveNoViolations();
  });
});

const SEARCH_ENDPOINT = 'http://localhost/api/auth/admin/chunk-inspector/doc-1/search';

describe('ChunkInspectorView — Suchfeld', () => {
  it('markiert die Treffer dieses Dokuments mit ihrem Wert', async () => {
    respondWith({
      success: true,
      header: header(),
      chunks: [chunk(0), chunk(1)],
      nextOffset: null,
    });
    server.use(
      http.get(SEARCH_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          hits: [{ index: 1, similarity: 0.83 }],
          totalResults: 5,
          scoped: false,
        })
      )
    );
    const { user, container } = renderWithProviders(
      <ChunkInspectorView documentId="doc-1" collection="grundsatz-system" />
    );
    await screen.findByText(/Chunk 0 Text/);

    await user.type(screen.getByLabelText('Suche in diesem Dokument'), 'Klimageld{Enter}');

    expect(await screen.findByText('Treffer · 0,83')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('beschriftet eine sammlungsweite Suche ehrlich und weist auf Treffer ausserhalb der Seite hin', async () => {
    respondWith({ success: true, header: header(), chunks: [chunk(0)], nextOffset: null });
    server.use(
      http.get(SEARCH_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          hits: [{ index: 3, similarity: 0.4 }],
          totalResults: 5,
          scoped: false,
        })
      )
    );
    const { user } = renderWithProviders(
      <ChunkInspectorView documentId="doc-1" collection="grundsatz-system" />
    );
    await screen.findByText(/Chunk 0 Text/);

    await user.type(screen.getByLabelText('Suche in diesem Dokument'), 'Klimageld{Enter}');

    expect(
      await screen.findByText('Suche über die ganze Sammlung; Treffer dieses Dokuments markiert')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        '1 von 5 Treffern stammen aus diesem Dokument. — weitere Treffer ggf. auf anderen Seiten'
      )
    ).toBeInTheDocument();
  });

  it('meldet einen fehlgeschlagenen Suchversuch, ohne die Chunk-Tabelle zu verlieren', async () => {
    respondWith({ success: true, header: header(), chunks: [chunk(0)], nextOffset: null });
    server.use(
      http.get(SEARCH_ENDPOINT, () =>
        HttpResponse.json({ success: false, message: 'Serverfehler' }, { status: 500 })
      )
    );
    const { user } = renderWithProviders(
      <ChunkInspectorView documentId="doc-1" collection="grundsatz-system" />
    );
    await screen.findByText(/Chunk 0 Text/);

    await user.type(screen.getByLabelText('Suche in diesem Dokument'), 'Klimageld{Enter}');

    expect(
      await screen.findByText('Chunk-Inspektor: Die Suche ist fehlgeschlagen (HTTP 500)')
    ).toBeInTheDocument();
    expect(screen.getByText(/Chunk 0 Text/)).toBeInTheDocument();
  });

  it('meldet fehlenden Zugriff bei einer 403-Suchantwort, statt der Server-Meldung', async () => {
    respondWith({ success: true, header: header(), chunks: [chunk(0)], nextOffset: null });
    server.use(
      http.get(SEARCH_ENDPOINT, () =>
        HttpResponse.json({ success: false, message: 'Keine Admin-Berechtigung.' }, { status: 403 })
      )
    );
    const { user } = renderWithProviders(
      <ChunkInspectorView documentId="doc-1" collection="grundsatz-system" />
    );
    await screen.findByText(/Chunk 0 Text/);

    await user.type(screen.getByLabelText('Suche in diesem Dokument'), 'Klimageld{Enter}');

    expect(
      await screen.findByText('Kein Zugriff (Instanz-Admin erforderlich)')
    ).toBeInTheDocument();
    expect(screen.getByText(/Chunk 0 Text/)).toBeInTheDocument();
  });

  it('beschriftet eine eingeschränkte Suche als solche', async () => {
    respondWith({
      success: true,
      header: header({ isSystemCollection: false }),
      chunks: [chunk(0)],
      nextOffset: null,
    });
    server.use(
      http.get(SEARCH_ENDPOINT, () =>
        HttpResponse.json({
          success: true,
          hits: [{ index: 0, similarity: 0.5 }],
          totalResults: 1,
          scoped: true,
        })
      )
    );
    const { user } = renderWithProviders(
      <ChunkInspectorView documentId="doc-1" collection="nb-1" />
    );
    await screen.findByText(/Chunk 0 Text/);

    await user.type(screen.getByLabelText('Suche in diesem Dokument'), 'Hitzeschutz{Enter}');

    expect(await screen.findByText('Suche auf dieses Dokument eingeschränkt')).toBeInTheDocument();
  });
});

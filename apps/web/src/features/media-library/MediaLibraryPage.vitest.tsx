import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { type MediaItem } from '@gruenerator/shared/media-library';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '../../test/msw-server';

import MediaLibraryPage from './MediaLibraryPage';

import { axe, renderWithProviders, userEvent } from '@/test-utils';

vi.mock('../../hooks/useAuth', () => ({
  useOptimizedAuth: () => ({ isAuthenticated: true, loading: false }),
}));

const API = 'http://localhost/api';

const mediaItem = (id: string, overrides: Partial<MediaItem> = {}): MediaItem => ({
  id,
  shareToken: `tok-${id}`,
  mediaType: 'image',
  title: `Bild ${id}`,
  thumbnailUrl: `/api/share/tok-${id}/preview`,
  fileSize: 2048,
  mimeType: 'image/png',
  altText: null,
  uploadSource: 'upload',
  originalFilename: `${id}.png`,
  downloadCount: 0,
  viewCount: 0,
  createdAt: new Date().toISOString(),
  ...overrides,
});

let listQueries: URLSearchParams[] = [];
let updates: Array<{ id: string; body: unknown }> = [];
let deletes: string[] = [];
let uploads = 0;

function serve(
  initial: MediaItem[] = [
    mediaItem('a'),
    mediaItem('b', { mediaType: 'video', mimeType: 'video/mp4', title: 'Rede' }),
  ]
) {
  let items = [...initial];
  listQueries = [];
  updates = [];
  deletes = [];
  uploads = 0;
  server.use(
    http.get(`${API}/media`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      listQueries.push(params);
      const type = params.get('type');
      const search = params.get('search')?.toLowerCase();
      const data = items.filter(
        (item) =>
          (!type || type === 'all' || item.mediaType === type) &&
          (!search || (item.title ?? '').toLowerCase().includes(search))
      );
      return HttpResponse.json({
        success: true,
        data,
        pagination: { total: data.length, limit: 50, offset: 0, hasMore: false },
      });
    }),
    http.put(`${API}/media/:id`, async ({ params, request }) => {
      const body = await request.json();
      updates.push({ id: String(params.id), body });
      return HttpResponse.json({ success: true, data: { id: params.id } });
    }),
    http.delete(`${API}/media/:id`, ({ params }) => {
      deletes.push(String(params.id));
      items = items.filter((item) => item.id !== params.id);
      return HttpResponse.json({ success: true });
    }),
    http.post(`${API}/media/upload`, () => {
      uploads += 1;
      const created = mediaItem(`neu${uploads}`);
      items = [created, ...items];
      return HttpResponse.json(
        {
          success: true,
          data: {
            id: created.id,
            shareToken: created.shareToken,
            shareUrl: '',
            mediaType: 'image',
            createdAt: created.createdAt,
          },
        },
        { status: 201 }
      );
    })
  );
}

function Where() {
  return <output aria-label="Adresse">{useLocation().search}</output>;
}

function renderPage(route = '/studio/mediathek') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/studio/mediathek"
        element={
          <>
            <MediaLibraryPage />
            <Where />
          </>
        }
      />
    </Routes>,
    { route }
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: API, authMode: 'cookie' }));
});

beforeEach(() => {
  localStorage.clear();
});

describe('MediaLibraryPage', () => {
  it('lists the library as cards under one page heading', async () => {
    serve();
    const { container } = renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Mediathek' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Bild a' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rede' })).toBeInTheDocument();
    expect(screen.getByText('2 Medien')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('filters by type through the filter menu and keeps it in the address', async () => {
    serve();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: 'Bild a' });

    await user.click(screen.getByRole('button', { name: 'Filter' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Videos' }));

    expect(screen.getByLabelText('Adresse')).toHaveTextContent('?typ=video');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Bild a' })).toBeNull());
    expect(listQueries.at(-1)?.get('type')).toBe('video');

    await user.click(screen.getByRole('button', { name: 'Filter „Videos“ entfernen' }));
    expect(await screen.findByRole('button', { name: 'Bild a' })).toBeInTheDocument();
  });

  it('opens a type filter from the address', async () => {
    serve();
    renderPage('/studio/mediathek?typ=video');
    expect(await screen.findByRole('button', { name: 'Rede' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bild a' })).toBeNull();
    expect(listQueries[0]?.get('type')).toBe('video');
  });

  it('searches as you type, after a pause', async () => {
    serve();
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole('button', { name: 'Bild a' });

    await user.click(screen.getByRole('button', { name: 'Suchen' }));
    await user.type(screen.getByRole('searchbox'), 'rede');

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Bild a' })).toBeNull());
    expect(listQueries.at(-1)?.get('search')).toBe('rede');
    expect(screen.getByRole('button', { name: 'Rede' })).toBeInTheDocument();
  });

  it('says so and offers the way back when a filter finds nothing', async () => {
    serve([mediaItem('a')]);
    const user = userEvent.setup();
    renderPage('/studio/mediathek?typ=audio');

    expect(await screen.findByText('Keine Medien gefunden')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Alle Medien anzeigen' }));
    expect(await screen.findByRole('button', { name: 'Bild a' })).toBeInTheDocument();
  });

  it('explains how to fill an empty library', async () => {
    serve([]);
    renderPage();
    expect(await screen.findByText('Noch keine Medien')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Alle Medien anzeigen' })).toBeNull();
  });

  it('edits title and alt text in the detail dialog', async () => {
    serve();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Bild a' }));
    const dialog = await screen.findByRole('dialog', { name: 'Bild a' });
    const save = within(dialog).getByRole('button', { name: 'Speichern' });
    expect(save).toBeDisabled();

    const title = within(dialog).getByLabelText('Titel');
    await user.clear(title);
    await user.type(title, 'Windrad');
    await user.type(within(dialog).getByLabelText('Alt-Text'), 'Ein Windrad');
    await user.click(save);

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(updates).toEqual([{ id: 'a', body: { title: 'Windrad', altText: 'Ein Windrad' } }]);
    expect(await screen.findByRole('button', { name: 'Windrad' })).toBeInTheDocument();
  });

  it('moves an item to the trash from the card menu', async () => {
    serve();
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Aktionen für Bild a' }));
    await user.click(await screen.findByRole('menuitem', { name: 'In den Papierkorb' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Bild a' })).toBeNull());
    expect(deletes).toEqual(['a']);
    expect(screen.getByText('1 Medium')).toBeInTheDocument();
  });

  it('uploads picked files one by one and reports each', async () => {
    serve([]);
    const user = userEvent.setup({ applyAccept: false });
    renderPage();
    await screen.findByText('Noch keine Medien');

    await user.upload(screen.getByLabelText('Dateien auswählen'), [
      new File(['a'], 'foto.png', { type: 'image/png' }),
      new File(['b'], 'notiz.txt', { type: 'text/plain' }),
    ]);

    expect(await screen.findByText('Hochgeladen')).toBeInTheDocument();
    expect(
      await screen.findByText(
        /Dateityp nicht unterstützt\. Erlaubt: JPEG, PNG, WebP, GIF, MP4, WebM, MOV/
      )
    ).toBeInTheDocument();
    expect(uploads).toBe(1);
    expect(await screen.findByRole('button', { name: 'Bild neu1' })).toBeInTheDocument();
  });

  it('keeps the drop hint while the pointer moves across tiles', async () => {
    serve();
    renderPage();
    const tile = await screen.findByRole('button', { name: 'Bild a' });
    const page = screen.getByRole('heading', { level: 1 }).closest('div.relative')!;
    const files = { types: ['Files'], files: [] };

    fireEvent.dragEnter(page, { dataTransfer: files });
    fireEvent.dragEnter(tile, { dataTransfer: files });
    fireEvent.dragLeave(page, { dataTransfer: files });
    expect(screen.getByText('Dateien hier ablegen')).toBeInTheDocument();

    fireEvent.dragLeave(tile, { dataTransfer: files });
    expect(screen.queryByText('Dateien hier ablegen')).toBeNull();
  });
});

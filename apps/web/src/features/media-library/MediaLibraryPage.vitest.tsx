import {
  type CanvasContentItem,
  type MediathekItem,
  type VideoContentItem,
} from '@gruenerator/contracts';
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

const reel = (id: string, title: string): VideoContentItem => ({
  kind: 'video',
  id,
  title,
  date: new Date().toISOString(),
  href: `/studio/video?project=${id}`,
  deleteEndpoint: `/api/subtitler/projects/${id}`,
  creatorName: null,
  accessType: 'owner',
  thumbnailUrl: null,
  duration: 12,
});

const canvas = (id: string, title: string): CanvasContentItem => ({
  kind: 'canvas',
  id,
  title,
  date: new Date().toISOString(),
  href: `/studio/canvas/${id}`,
  deleteEndpoint: `/api/canvas/${id}`,
  creatorName: null,
  accessType: 'owner',
  thumbnailUrl: null,
});

type Entry = MediaItem | VideoContentItem | CanvasContentItem;

const toWire = (entry: Entry): MediathekItem =>
  'kind' in entry
    ? entry
    : {
        kind: 'media',
        ...entry,
        duration: entry.duration ?? null,
        imageType: entry.imageType ?? null,
        imageMetadata: null,
        contentOrigin: entry.contentOrigin ?? null,
        status: 'ready',
      };

const mediaTypeOf = (entry: Entry) =>
  'kind' in entry ? (entry.kind === 'video' ? 'video' : 'image') : entry.mediaType;

let listQueries: URLSearchParams[] = [];
let updates: Array<{ id: string; body: unknown }> = [];
let deletes: string[] = [];
let uploads = 0;

function serve(
  initial: Entry[] = [
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
    http.get(`${API}/content/mediathek`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      listQueries.push(params);
      const typ = params.get('typ');
      const search = params.get('search')?.toLowerCase();
      const data = items.filter(
        (item) =>
          (!typ ||
            typ === 'all' ||
            (typ === 'reel' && 'kind' in item && item.kind === 'video') ||
            mediaTypeOf(item) === typ) &&
          (!search || (item.title ?? '').toLowerCase().includes(search))
      );
      return HttpResponse.json({
        items: data.map(toWire),
        total: data.length,
        limit: 50,
        offset: 0,
        hasMore: false,
      });
    }),
    http.put(`${API}/media/:id`, async ({ params, request }) => {
      const body = await request.json();
      updates.push({ id: String(params.id), body });
      items = items.map((item) =>
        item.id === params.id && !('kind' in item)
          ? { ...item, title: (body as { title: string }).title }
          : item
      );
      return HttpResponse.json({ success: true, data: { id: params.id } });
    }),
    http.delete(`${API}/subtitler/projects/:id`, ({ params }) => {
      deletes.push(String(params.id));
      items = items.filter((item) => item.id !== params.id);
      return HttpResponse.json({ success: true });
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
      <Route path="/studio/canvas/:id" element={<p>Canvas-Editor</p>} />
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
    expect(listQueries.at(-1)?.get('typ')).toBe('video');

    await user.click(screen.getByRole('button', { name: 'Filter „Videos“ entfernen' }));
    expect(await screen.findByRole('button', { name: 'Bild a' })).toBeInTheDocument();
  });

  it('opens a type filter from the address', async () => {
    serve();
    renderPage('/studio/mediathek?typ=video');
    expect(await screen.findByRole('button', { name: 'Rede' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bild a' })).toBeNull();
    expect(listQueries[0]?.get('typ')).toBe('video');
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

  it('lists Reels and canvas Sharepics next to the files', async () => {
    serve([mediaItem('a'), reel('r1', 'Wahlkampf-Reel'), canvas('c1', 'Plakat')]);
    renderPage();

    expect(await screen.findByRole('button', { name: 'Wahlkampf-Reel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plakat' })).toBeInTheDocument();
    expect(screen.getByText('Reel')).toBeInTheDocument();
    expect(screen.getByText('3 Medien')).toBeInTheDocument();
  });

  it('opens Reels only from the address filter', async () => {
    serve([mediaItem('a'), reel('r1', 'Wahlkampf-Reel')]);
    renderPage('/studio/mediathek?typ=reel');

    expect(await screen.findByRole('button', { name: 'Wahlkampf-Reel' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bild a' })).toBeNull();
    expect(listQueries[0]?.get('typ')).toBe('reel');
  });

  it('opens a canvas Sharepic in its editor', async () => {
    serve([canvas('c1', 'Plakat')]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Plakat' }));

    expect(await screen.findByText('Canvas-Editor')).toBeInTheDocument();
  });

  it('moves a Reel to the trash through its own endpoint', async () => {
    serve([reel('r1', 'Wahlkampf-Reel')]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Aktionen für Wahlkampf-Reel' }));
    await user.click(await screen.findByRole('menuitem', { name: 'In den Papierkorb' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Wahlkampf-Reel' })).toBeNull()
    );
    expect(deletes).toEqual(['r1']);
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

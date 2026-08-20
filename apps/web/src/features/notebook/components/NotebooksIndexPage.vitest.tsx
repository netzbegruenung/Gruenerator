import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

import { NotebooksIndexFooter } from './NotebooksIndexPage';

const PUBLIC_ENDPOINT = 'http://localhost/api/auth/notebook-collections/public';
const LIKES_ENDPOINT = 'http://localhost/api/auth/notebook-collections/likes';
const MONITOR_LATEST = 'http://localhost/api/monitor/latest';
const MONITOR_POLLS = 'http://localhost/api/monitor/polls';

// Minimal wire shape of a public collection — only the fields the gallery reads.
const publicCollection = (over: Record<string, unknown> = {}) => ({
  id: 'basis-1',
  user_id: 'someone-else',
  name: 'Kommunalpolitik Nord',
  description: 'Beschlüsse aus dem Kreisverband',
  creator_name: 'Jamie Grün',
  slug_suffix: 'ab12cd',
  is_public: true,
  likes_count: 4,
  documents: [],
  document_count: 0,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...over,
});

function serveCollections(collections: ReturnType<typeof publicCollection>[]) {
  server.use(
    http.get(PUBLIC_ENDPOINT, () => HttpResponse.json({ success: true, collections })),
    http.get(LIKES_ENDPOINT, () => HttpResponse.json({ success: true, liked_ids: [] })),
    // The tool tiles fetch live subtexts; empty payloads keep them on their
    // static descriptions instead of failing the unhandled-request guard.
    http.get(MONITOR_LATEST, () => HttpResponse.json({ topics: [] }, { status: 200 })),
    http.get(MONITOR_POLLS, () => HttpResponse.json({ average: {} }, { status: 200 }))
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

describe('NotebooksIndexFooter — "Von der Basis"', () => {
  it('shows the category tile with the public notebook count', async () => {
    serveCollections([publicCollection(), publicCollection({ id: 'basis-2', name: 'Zweites' })]);

    renderWithProviders(<NotebooksIndexFooter />);

    expect(await screen.findByRole('button', { name: /Von der Basis/ })).toBeInTheDocument();
    expect(screen.getByText('2 öffentliche Notebooks')).toBeInTheDocument();
  });

  it('uses the singular label for exactly one public notebook', async () => {
    serveCollections([publicCollection()]);

    renderWithProviders(<NotebooksIndexFooter />);

    expect(await screen.findByText('1 öffentliches Notebook')).toBeInTheDocument();
  });

  it('expands into the community notebooks with author attribution', async () => {
    serveCollections([publicCollection()]);

    const { user } = renderWithProviders(<NotebooksIndexFooter />);
    await user.click(await screen.findByRole('button', { name: /Von der Basis/ }));

    // The card title is an h3, the section header an h2 — level pins the latter.
    const section = screen
      .getByRole('heading', { level: 2, name: 'Von der Basis' })
      .closest('section');
    expect(section).not.toBeNull();
    expect(within(section!).getByText('Kommunalpolitik Nord')).toBeInTheDocument();
    expect(within(section!).getByText('von Jamie Grün')).toBeInTheDocument();
  });

  it('hides the tile when no notebook is publicly listed', async () => {
    serveCollections([]);

    renderWithProviders(<NotebooksIndexFooter />);

    // The Tools row renders unconditionally — wait for it so the absence below
    // is measured after the public query settled, not before it resolved.
    expect(await screen.findByText('Neues Notebook erstellen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Von der Basis/ })).not.toBeInTheDocument();
  });
});

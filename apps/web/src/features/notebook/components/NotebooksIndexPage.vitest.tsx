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
const MONITOR_FEED = 'http://localhost/api/monitor/what-happened';

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

const EMPTY_FEED = { days: [], totalCount: 0, sourceGroups: [], landesverbaende: [] };

function serveCollections(
  collections: ReturnType<typeof publicCollection>[],
  // The tool tiles fetch live subtexts; empty payloads keep them on their
  // static descriptions instead of failing the unhandled-request guard.
  monitor: Record<string, unknown> = { topics: [] },
  feed: Record<string, unknown> = EMPTY_FEED
) {
  server.use(
    http.get(PUBLIC_ENDPOINT, () => HttpResponse.json({ success: true, collections })),
    http.get(LIKES_ENDPOINT, () => HttpResponse.json({ success: true, liked_ids: [] })),
    http.get(MONITOR_LATEST, () => HttpResponse.json(monitor, { status: 200 })),
    http.get(MONITOR_POLLS, () => HttpResponse.json({ average: {} }, { status: 200 })),
    http.get(MONITOR_FEED, () => HttpResponse.json(feed, { status: 200 }))
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

describe('NotebooksIndexFooter — live tool tiles', () => {
  it('replaces the Themen, Trends and Feed descriptions with live data', async () => {
    serveCollections(
      [],
      {
        topics: [
          {
            topic: 'klima',
            articleCount: 12,
            topArticles: [{ title: 'Kohleausstieg vorgezogen' }],
          },
        ],
        socialTrends: [
          { rank: 1, name: '#Klimageld', url: 'https://x.com/search?q=%23Klimageld' },
          { rank: 2, name: '#Bundestag', url: 'https://x.com/search?q=%23Bundestag' },
        ],
      },
      {
        days: [
          {
            date: '2026-08-26',
            counts: { stored: 1, updated: 0 },
            articles: [{ title: 'Landesparteitag beschliesst Wohnraumprogramm' }],
          },
        ],
        totalCount: 1,
        sourceGroups: ['landesverbaende'],
        landesverbaende: ['BY'],
      }
    );

    renderWithProviders(<NotebooksIndexFooter />);

    expect(await screen.findByText('Kohleausstieg vorgezogen')).toBeInTheDocument();
    expect(await screen.findByText('Jetzt im Trend: #Klimageld')).toBeInTheDocument();
    expect(
      await screen.findByText('Landesparteitag beschliesst Wohnraumprogramm')
    ).toBeInTheDocument();
    // Each tile links to its own page.
    expect(screen.getByRole('link', { name: /Themen/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/themen')
    );
    expect(screen.getByRole('link', { name: /Trends/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/trends')
    );
    expect(screen.getByRole('link', { name: /Feed/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/feed')
    );
  });

  it('falls back to the static descriptions when the snapshot carries no trends', async () => {
    serveCollections([], { topics: [], socialTrends: [] }, EMPTY_FEED);

    renderWithProviders(<NotebooksIndexFooter />);

    expect(await screen.findByText('Was gerade auf X im Trend liegt.')).toBeInTheDocument();
    expect(screen.getByText('Meistdiskutierte Themen der letzten 24 Stunden.')).toBeInTheDocument();
    expect(screen.getByText('Bluesky und neue Beiträge der Landesverbände.')).toBeInTheDocument();
  });
});

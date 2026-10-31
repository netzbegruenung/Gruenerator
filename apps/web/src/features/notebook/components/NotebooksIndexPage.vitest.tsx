import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/authStore';
import { item, sectionsResponse } from '../../../test/marketplaceFixtures';
import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

import { NotebooksIndexFooter } from './NotebooksIndexPage';

const MARKETPLACE_ENDPOINT = 'http://localhost/api/marketplace';
const SHARED_ENDPOINT = 'http://localhost/api/auth/notebook-collections/shared';
const LIKES_ENDPOINT = 'http://localhost/api/auth/notebook-collections/likes';
const MONITOR_LATEST = 'http://localhost/api/monitor/latest';
const MONITOR_POLLS = 'http://localhost/api/monitor/polls';
const MONITOR_FEED = 'http://localhost/api/monitor/what-happened';
const MONITOR_ENTITY = 'http://localhost/api/monitor/entities/:id';

vi.mock('@gruenerator/chat', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUserLandesverbaende: () => ({
    lvIds: null,
    headings: { agents: '', skills: '' },
    shelfLabel: '',
    isHydrated: true,
  }),
}));

let marketplaceQueries: URLSearchParams[] = [];

// Minimal wire shape of a collection — only the fields the gallery reads.
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

const SAVED = item('notebook', 'Kommunalpolitik Nord', {
  ref: 'basis-1',
  authorName: 'Jamie Grün',
  saved: true,
});

function serveCollections(
  /** Notebooks bookmarked in the Marktplatz — what „Gemerkt" lists. */
  saved: ReturnType<typeof item>[],
  // The tool tiles fetch live subtexts; empty payloads keep them on their
  // static descriptions instead of failing the unhandled-request guard.
  monitor: Record<string, unknown> = { topics: [] },
  feed: Record<string, unknown> = EMPTY_FEED,
  shared: ReturnType<typeof publicCollection>[] = [],
  entity: Record<string, unknown> | null = null
) {
  server.use(
    http.get(MARKETPLACE_ENDPOINT, ({ request }) => {
      const params = new URL(request.url).searchParams;
      marketplaceQueries.push(params);
      const items = params.get('scope') === 'saved' ? saved : [];
      return HttpResponse.json(sectionsResponse([{ kind: 'notebook', items, hasMore: false }]));
    }),
    http.get(SHARED_ENDPOINT, () => HttpResponse.json({ success: true, collections: shared })),
    http.get(LIKES_ENDPOINT, () => HttpResponse.json({ success: true, liked_ids: [] })),
    http.get(MONITOR_LATEST, () => HttpResponse.json(monitor, { status: 200 })),
    http.get(MONITOR_POLLS, () => HttpResponse.json({ average: {} }, { status: 200 })),
    http.get(MONITOR_FEED, () => HttpResponse.json(feed, { status: 200 })),
    http.get(MONITOR_ENTITY, () =>
      entity ? HttpResponse.json(entity, { status: 200 }) : new HttpResponse(null, { status: 404 })
    )
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
  marketplaceQueries = [];
  // The widgets keep their last answer in localStorage; jsdom keeps it across tests.
  localStorage.clear();
});

describe('NotebooksIndexFooter — „Gemerkt" and Landesverbände', () => {
  it('has no „Öffentlich" tile — public notebooks live in the Marktplatz', async () => {
    serveCollections([]);

    renderWithProviders(<NotebooksIndexFooter />);
    expect(await screen.findByRole('button', { name: /Landesverbände/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Öffentlich/ })).not.toBeInTheDocument();
  });

  it('shows the Landesverband notebooks with their Marktplatz photos', async () => {
    serveCollections([]);

    const { user } = renderWithProviders(<NotebooksIndexFooter />);
    await user.click(await screen.findByRole('button', { name: /Landesverbände/ }));

    const section = screen
      .getByRole('heading', { level: 2, name: 'Landesverbände' })
      .closest('section');
    const photos = [...section!.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(photos.length).toBeGreaterThan(0);
    expect(photos.every((src) => src?.startsWith('/images/marketplace/landesverbaende/'))).toBe(
      true
    );
  });

  it('lists the notebooks bookmarked in the Marktplatz under „Gemerkt", with their author', async () => {
    serveCollections([SAVED]);

    const { user } = renderWithProviders(<NotebooksIndexFooter />);
    expect(await screen.findByText('1 gemerktes Notebook')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Gemerkt/ }));

    // The card title is an h3, the section header an h2 — level pins the latter.
    const section = screen.getByRole('heading', { level: 2, name: 'Gemerkt' }).closest('section');
    expect(section).not.toBeNull();
    expect(within(section!).getByText('Kommunalpolitik Nord')).toBeInTheDocument();
    expect(within(section!).getByText('von Jamie Grün')).toBeInTheDocument();
  });

  it('shows no „Gemerkt" tile while nothing is bookmarked', async () => {
    serveCollections([]);

    renderWithProviders(<NotebooksIndexFooter />);

    expect(await screen.findByText('Neues erstellen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gemerkt/ })).not.toBeInTheDocument();
  });
});

describe('NotebooksIndexFooter — „Parlamente"', () => {
  afterEach(() => {
    useAuthStore.setState({ locale: 'de-DE' });
  });

  it('expands into the parliament notebooks in registry order', async () => {
    useAuthStore.setState({ locale: 'de-DE' });
    serveCollections([]);

    const { user } = renderWithProviders(<NotebooksIndexFooter />);
    await user.click(await screen.findByRole('button', { name: /Parlamente/ }));

    const section = screen
      .getByRole('heading', { level: 2, name: 'Parlamente' })
      .closest('section');
    expect(section).not.toBeNull();
    // A tile's name is its title plus description; the title is its first line.
    const titles = within(section!)
      .getAllByRole('button')
      .filter((b) => !/favorit/i.test(b.getAttribute('aria-label') ?? ''))
      .map((b) => b.querySelector('.min-w-0 > span')?.textContent);
    expect(titles).toEqual([
      'Bundestagsfraktion',
      'Bundestag: Reden & Drucksachen',
      'Bundesrat: Drucksachen',
      'Landtag NRW',
      'Abgeordnetenhaus Berlin',
      'Bayerischer Landtag',
    ]);
  });

  it('hides the tile for Austrian users', async () => {
    useAuthStore.setState({ locale: 'de-AT' });
    serveCollections([]);

    renderWithProviders(<NotebooksIndexFooter />);

    expect(await screen.findByText('Neues erstellen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Parlamente/ })).not.toBeInTheDocument();
  });
});

describe('NotebooksIndexFooter — „Mit dir geteilt"', () => {
  const sharedCollection = (over: Record<string, unknown> = {}) =>
    publicCollection({
      id: 'shared-1',
      name: 'Haushalt 2027',
      is_public: false,
      access_source: 'shared',
      shared_via_groups: ['KV Nord'],
      ...over,
    });

  it('expands into the notebooks shared via a Projekt, naming the Projekt', async () => {
    serveCollections([], undefined, undefined, [sharedCollection()]);

    const { user } = renderWithProviders(<NotebooksIndexFooter />);
    await user.click(await screen.findByRole('button', { name: /Meine Notebooks/ }));

    const section = screen
      .getByRole('heading', { level: 2, name: 'Meine Notebooks' })
      .closest('section');
    expect(section).not.toBeNull();
    expect(within(section!).getByText('Haushalt 2027')).toBeInTheDocument();
    expect(within(section!).getByText('Geteilt via KV Nord')).toBeInTheDocument();
  });

  it('hides the tile when nothing is shared with the user', async () => {
    serveCollections([]);

    renderWithProviders(<NotebooksIndexFooter />);

    expect(await screen.findByText('Neues erstellen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Meine Notebooks/ })).not.toBeInTheDocument();
  });
});

describe('NotebooksIndexFooter — live tool tiles', () => {
  it('shows live content in the Themen & Trends and Feed widgets', async () => {
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
        keywords: [
          { keyword: 'Kohleausstieg', count: 9, topic: 'klima' },
          { keyword: 'Klimageld', count: 7, topic: 'klima' },
          { keyword: 'Wärmepumpe', count: 4, topic: 'klima' },
          { keyword: 'Bundestag', count: 2, topic: null },
        ],
        socialTrends: [{ rank: 1, name: '#Klimageld', url: 'https://x.com/search?q=%23Klimageld' }],
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

    // Top keyword as the headline, the next ones below it, plus the X trend.
    expect(await screen.findByText('Kohleausstieg')).toBeInTheDocument();
    expect(screen.getByText('Klimageld')).toBeInTheDocument();
    expect(screen.getByText('#Klimageld')).toBeInTheDocument();
    expect(
      await screen.findByText('Landesparteitag beschliesst Wohnraumprogramm')
    ).toBeInTheDocument();
    // Each tile links to its own page.
    expect(screen.getByRole('link', { name: /Themen & Trends/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/themen')
    );
    expect(screen.getByRole('link', { name: /Feed/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/feed')
    );
  });

  it('shows the latest articles on the Watcher widget', async () => {
    serveCollections([], undefined, undefined, [], {
      count: 14,
      sources: ['taz', 'Spiegel', 'FAZ'],
      articles: [
        {
          url: 'https://example.org/a',
          title: 'Grüne fordern Klimageld',
          source: 'taz',
          publishedAt: null,
          excerpt: '',
          locale: 'de',
          topics: {},
          primaryTopic: null,
        },
      ],
    });

    renderWithProviders(<NotebooksIndexFooter />);

    expect(await screen.findByText('Grüne fordern Klimageld')).toBeInTheDocument();
  });

  it('survives shapeless 200 answers from every monitor endpoint (E2E fixtures)', async () => {
    // The E2E fixtures answer unknown /api/ routes with `{ success, data: [], items: [] }`,
    // so `average`, `polls`, `days`, `keywords` and `articles` are all missing.
    const shapeless = { success: true, data: [], items: [] };
    serveCollections([], shapeless, shapeless, [], shapeless);
    let polled = false;
    server.use(
      http.get(MONITOR_POLLS, () => {
        polled = true;
        return HttpResponse.json(shapeless, { status: 200 });
      })
    );

    renderWithProviders(<NotebooksIndexFooter />);

    // A skeleton holds the place while loading — wait until the answers were consumed.
    await waitFor(() => expect(polled).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(screen.getByText('Sonntagsfrage, Ländertrends und Meinungsbild.')).toBeInTheDocument();
    expect(
      screen.getByText('Meistdiskutierte Themen und X-Trends der letzten 24 Stunden.')
    ).toBeInTheDocument();
  });

  it('holds the tile with a skeleton instead of the static text while loading', async () => {
    serveCollections([]);
    server.use(http.get(MONITOR_POLLS, () => new Promise<never>(() => {})));

    renderWithProviders(<NotebooksIndexFooter />);

    const tile = await screen.findByRole('link', { name: /Umfragen/ });
    expect(tile).toHaveAttribute('aria-busy', 'true');
    expect(tile.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    expect(screen.queryByText('Sonntagsfrage, Ländertrends und Meinungsbild.')).toBeNull();
  });

  it('renders the stored answer at once, before the server has answered', async () => {
    serveCollections([]);
    server.use(http.get(MONITOR_ENTITY, () => new Promise<never>(() => {})));
    localStorage.setItem(
      `gruenerator:monitor-cache:v1:${JSON.stringify(['monitor', 'entity', 'gruene', 'de'])}`,
      JSON.stringify({
        at: Date.now(),
        data: {
          entity: { id: 'gruene', label: 'Die Grünen' },
          count: 1,
          sources: ['taz'],
          articles: [
            {
              url: 'https://example.org/b',
              title: 'Gespeicherte Schlagzeile',
              source: 'taz',
              publishedAt: null,
              excerpt: '',
              locale: 'de',
              topics: {},
              primaryTopic: null,
            },
          ],
        },
      })
    );

    renderWithProviders(<NotebooksIndexFooter />);

    expect(await screen.findByText('Gespeicherte Schlagzeile')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Watcher/ })).toHaveAttribute('aria-busy', 'false');
  });

  it('falls back to the static descriptions when the snapshot carries no keywords', async () => {
    serveCollections([], { topics: [], keywords: [], socialTrends: [] }, EMPTY_FEED);

    renderWithProviders(<NotebooksIndexFooter />);

    expect(
      await screen.findByText('Meistdiskutierte Themen und X-Trends der letzten 24 Stunden.')
    ).toBeInTheDocument();
    expect(screen.getByText('Bluesky und neue Beiträge der Landesverbände.')).toBeInTheDocument();
  });
});

describe('NotebooksIndexFooter — Wissensdatenbank offline', () => {
  const OWN_ENDPOINT = 'http://localhost/api/auth/notebook-collections';
  const NOTICE = /Wissensdatenbank ist gerade nicht erreichbar/;

  afterEach(() => {
    useAuthStore.setState({ user: null });
  });

  function serveOwn(status: number, error: string) {
    useAuthStore.setState({ user: { id: 'user-1' } as never });
    serveCollections([]);
    server.use(http.get(OWN_ENDPOINT, () => HttpResponse.json({ error }, { status })));
  }

  it('explains the outage when the vector store is unreachable', async () => {
    serveOwn(503, 'vector_store_unavailable');

    renderWithProviders(<NotebooksIndexFooter />);

    expect(await screen.findByText(NOTICE, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('stays silent on an unrelated server error', async () => {
    serveOwn(500, 'Internal server error');

    renderWithProviders(<NotebooksIndexFooter />);

    expect(await screen.findByText('Neues erstellen')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 1500));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});

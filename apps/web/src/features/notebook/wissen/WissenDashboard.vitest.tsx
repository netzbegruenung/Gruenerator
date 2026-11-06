import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../../../stores/authStore';
import { item, sectionsResponse } from '../../../test/marketplaceFixtures';
import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

import { WissenDashboard } from './WissenDashboard';

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

// Minimal wire shape of a collection — only the fields the shelf reads.
const sharedCollection = (over: Record<string, unknown> = {}) => ({
  id: 'shared-1',
  user_id: 'someone-else',
  name: 'Haushalt 2027',
  description: null,
  slug_suffix: 'ab12cd',
  is_public: false,
  access_source: 'shared',
  shared_via_groups: ['KV Nord'],
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

const watcherArticle = (title: string) => ({
  url: `https://example.org/${encodeURIComponent(title)}`,
  title,
  source: 'taz',
  publishedAt: null,
  excerpt: '',
  locale: 'de',
  topics: {},
  primaryTopic: null,
});

const ENTITY = {
  entity: { id: 'gruene', label: 'Die Grünen' },
  count: 1,
  sources: ['taz'],
  articles: [watcherArticle('Grüne fordern Klimageld')],
};

const FEED = {
  days: [
    {
      date: '2026-08-26',
      counts: { stored: 1, updated: 0 },
      articles: [
        {
          title: 'Landesparteitag beschliesst Wohnraumprogramm',
          sourceUrl: 'https://example.org/lpt',
          sourceGroupId: 'landesverbaende',
          sourceName: 'Grüne Bayern',
          excerpt: 'Der Parteitag hat ein Programm beschlossen.',
          landesverband: 'BY',
          collection: 'landesverbaende',
          eventType: 'stored',
          publishedAt: null,
          indexedAt: '2026-08-26T08:00:00.000Z',
          syncRunUrl: null,
        },
      ],
    },
  ],
  totalCount: 1,
  sourceGroups: ['landesverbaende'],
  landesverbaende: ['BY'],
};

interface Serve {
  saved?: ReturnType<typeof item>[];
  shared?: ReturnType<typeof sharedCollection>[];
  monitor?: Record<string, unknown>;
  feed?: Record<string, unknown>;
  polls?: Record<string, unknown>;
  entity?: Record<string, unknown> | null;
}

/** Answers every endpoint the dashboard reads; empty by default. */
function serve({
  saved = [],
  shared = [],
  monitor = { topics: [] },
  feed = EMPTY_FEED,
  polls = { average: {} },
  entity = null,
}: Serve = {}) {
  server.use(
    http.get(MARKETPLACE_ENDPOINT, ({ request }) => {
      const scope = new URL(request.url).searchParams.get('scope');
      const items = scope === 'saved' ? saved : [];
      return HttpResponse.json(sectionsResponse([{ kind: 'notebook', items, hasMore: false }]));
    }),
    http.get(SHARED_ENDPOINT, () => HttpResponse.json({ success: true, collections: shared })),
    http.get(LIKES_ENDPOINT, () => HttpResponse.json({ success: true, liked_ids: [] })),
    http.get(MONITOR_LATEST, () => HttpResponse.json(monitor)),
    http.get(MONITOR_POLLS, () => HttpResponse.json(polls)),
    http.get(MONITOR_FEED, () => HttpResponse.json(feed)),
    http.get(MONITOR_ENTITY, () =>
      entity ? HttpResponse.json(entity) : new HttpResponse(null, { status: 404 })
    )
  );
}

/** Opens a shelf tile and returns the list it controls. */
async function openShelf(user: { click: (el: Element) => Promise<void> }, name: RegExp) {
  const tile = await screen.findByRole('button', { name });
  await user.click(tile);
  expect(tile).toHaveAttribute('aria-expanded', 'true');
  const panel = document.getElementById(tile.getAttribute('aria-controls') ?? '');
  expect(panel).not.toBeNull();
  return within(panel!).getByRole('list');
}

/** The entry titles of an expanded list, in order. */
const entryTitles = (list: HTMLElement) =>
  within(list)
    .getAllByRole('link')
    .map((a) => a.firstElementChild?.textContent);

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
  // The monitor hooks keep their last answer in localStorage; jsdom keeps it across tests.
  localStorage.clear();
  useAuthStore.setState({ locale: 'de-DE', user: null });
});

describe('WissenDashboard — „Deine Notebooks"', () => {
  it('shows Parlamente and KommunalWiki as tiles, with no „Öffentlich" tile', async () => {
    serve();

    renderWithProviders(<WissenDashboard />);

    expect(await screen.findByRole('button', { name: /Parlamente/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /KommunalWiki/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Öffentlich/ })).not.toBeInTheDocument();
  });

  it('shows the Landesverbände as their own row of Marktplatz photos', async () => {
    serve();

    renderWithProviders(<WissenDashboard />);

    const row = await screen.findByRole('region', { name: 'Landesverbände' });
    expect(within(row).getByRole('link', { name: /Berlin/ })).toBeInTheDocument();
    const photos = [...row.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(photos.length).toBeGreaterThan(0);
    expect(photos.every((src) => src?.startsWith('/images/marketplace/landesverbaende/'))).toBe(
      true
    );
    // A row, not a tile: nothing to expand.
    expect(screen.queryByRole('button', { name: /Landesverbände/ })).not.toBeInTheDocument();
  });

  it('expands Parlamente into the parliament notebooks in registry order', async () => {
    serve();

    const { user } = renderWithProviders(<WissenDashboard />);

    expect(entryTitles(await openShelf(user, /Parlamente/))).toEqual([
      'Bundestagsfraktion',
      'Bundestag: Reden & Drucksachen',
      'Bundesrat: Drucksachen',
      'Landtag NRW',
      'Abgeordnetenhaus Berlin',
      'Bayerischer Landtag',
    ]);
  });

  it('keeps only one shelf open at a time', async () => {
    serve({ shared: [sharedCollection()] });

    const { user } = renderWithProviders(<WissenDashboard />);
    await openShelf(user, /Parlamente/);
    await openShelf(user, /Meine Notebooks/);

    const parlamente = screen.getByRole('button', { name: /Parlamente/ });
    expect(parlamente).toHaveAttribute('aria-expanded', 'false');
    expect(parlamente).not.toHaveAttribute('aria-controls');
  });

  it('gathers shared and bookmarked notebooks under „Meine Notebooks"', async () => {
    serve({ saved: [SAVED], shared: [sharedCollection()] });

    const { user } = renderWithProviders(<WissenDashboard />);
    expect(await screen.findByText('2 Notebooks')).toBeInTheDocument();
    const list = await openShelf(user, /Meine Notebooks/);

    expect(within(list).getByText('Haushalt 2027')).toBeInTheDocument();
    expect(within(list).getByText('Geteilt via KV Nord')).toBeInTheDocument();
    expect(within(list).getByText('Kommunalpolitik Nord')).toBeInTheDocument();
    expect(within(list).getByText('Gemerkt · von Jamie Grün')).toBeInTheDocument();
  });

  it('turns „Meine Notebooks" into a create link while there is nothing to list', async () => {
    serve();

    renderWithProviders(<WissenDashboard />);

    const tile = await screen.findByRole('link', { name: /Meine Notebooks/ });
    expect(tile).toHaveAttribute('href', '/notebooks/neu');
  });

  it('shows Austrian users their notebooks, without Landesverbände and Parlamente', async () => {
    useAuthStore.setState({ locale: 'de-AT' });
    serve();

    renderWithProviders(<WissenDashboard />);

    expect(await screen.findByRole('link', { name: /Meine Notebooks/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Parlamente/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Landesverbände' })).not.toBeInTheDocument();
  });
});

describe('WissenDashboard — Nachrichten und Kennzahlen', () => {
  it('mixes Feed and Watcher in the headline slider, Feed first', async () => {
    serve({ feed: FEED, entity: ENTITY });

    renderWithProviders(<WissenDashboard />);

    const slider = await screen.findByRole('region', { name: 'Schlagzeilen' });
    const slides = await within(slider).findAllByRole('article');
    expect(slides.map((s) => s.querySelector('h3')?.textContent)).toEqual([
      'Landesparteitag beschliesst Wohnraumprogramm',
      'Grüne fordern Klimageld',
    ]);
    expect(within(slides[0]).getByText(/^Feed · Bayern/)).toBeInTheDocument();
    // Only the visible slide is reachable.
    expect(slides[1]).toHaveAttribute('inert');
  });

  it('links Watcher and Feed under the slider', async () => {
    serve({ feed: FEED, entity: ENTITY });

    renderWithProviders(<WissenDashboard />);

    const slider = await screen.findByRole('region', { name: 'Schlagzeilen' });
    expect(await within(slider).findByRole('link', { name: 'Watcher' })).toHaveAttribute(
      'href',
      expect.stringContaining('/watcher')
    );
    expect(within(slider).getByRole('link', { name: 'Feed' })).toHaveAttribute(
      'href',
      expect.stringContaining('/feed')
    );
  });

  it('offers no Feed link to Austrian users — the feed is German only', async () => {
    useAuthStore.setState({ locale: 'de-AT' });
    serve({ entity: ENTITY });

    renderWithProviders(<WissenDashboard />);

    const slider = await screen.findByRole('region', { name: 'Schlagzeilen' });
    expect(await within(slider).findByRole('link', { name: 'Watcher' })).toBeInTheDocument();
    expect(within(slider).queryByRole('link', { name: 'Feed' })).not.toBeInTheDocument();
  });

  it('shows the top keywords under „Im Gespräch"', async () => {
    serve({
      monitor: {
        topics: [],
        keywords: [
          { keyword: 'Kohleausstieg', count: 9, topic: 'klima' },
          { keyword: 'Klimageld', count: 7, topic: 'klima' },
        ],
      },
    });

    renderWithProviders(<WissenDashboard />);

    const card = await screen.findByRole('region', { name: 'Im Gespräch' });
    expect(await within(card).findByText('Kohleausstieg')).toBeInTheDocument();
    expect(within(card).getByText('Klimageld')).toBeInTheDocument();
  });

  it('holds every section with a skeleton while loading', async () => {
    serve();
    const never = () => new Promise<never>(() => {});
    server.use(
      http.get(MONITOR_POLLS, never),
      http.get(MONITOR_LATEST, never),
      http.get(MONITOR_ENTITY, never),
      http.get(MONITOR_FEED, never)
    );

    renderWithProviders(<WissenDashboard />);

    for (const name of ['Schlagzeilen', 'Umfragen', 'Im Gespräch']) {
      const region = await screen.findByRole('region', { name });
      expect(region).toHaveAttribute('aria-busy', 'true');
      expect(region.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    }
  });

  it('survives shapeless 200 answers from every monitor endpoint (E2E fixtures)', async () => {
    // The E2E fixtures answer unknown /api/ routes with `{ success, data: [], items: [] }`.
    const shapeless = { success: true, data: [], items: [] };
    let polled = false;
    serve({ monitor: shapeless, feed: shapeless, entity: shapeless });
    server.use(
      http.get(MONITOR_POLLS, () => {
        polled = true;
        return HttpResponse.json(shapeless);
      })
    );

    renderWithProviders(<WissenDashboard />);

    await waitFor(() => expect(polled).toBe(true));
    expect(await screen.findByText('Gerade keine Umfragewerte.')).toBeInTheDocument();
    expect(await screen.findByText('Gerade keine Themen.')).toBeInTheDocument();
    expect(await screen.findByText('Gerade keine neuen Schlagzeilen.')).toBeInTheDocument();
  });

  it('renders the stored Watcher answer at once, before the server has answered', async () => {
    serve();
    server.use(http.get(MONITOR_ENTITY, () => new Promise<never>(() => {})));
    localStorage.setItem(
      `gruenerator:monitor-cache:v1:${JSON.stringify(['monitor', 'entity', 'gruene', 'de'])}`,
      JSON.stringify({
        at: Date.now(),
        data: { ...ENTITY, articles: [watcherArticle('Gespeicherte Schlagzeile')] },
      })
    );

    renderWithProviders(<WissenDashboard />);

    const slider = await screen.findByRole('region', { name: 'Schlagzeilen' });
    expect(await within(slider).findByText('Gespeicherte Schlagzeile')).toBeInTheDocument();
  });
});

describe('WissenDashboard — Wissensdatenbank offline', () => {
  const OWN_ENDPOINT = 'http://localhost/api/auth/notebook-collections';
  const NOTICE = /Wissensdatenbank ist gerade nicht erreichbar/;

  function serveOwn(status: number, error: string) {
    useAuthStore.setState({ user: { id: 'user-1' } as never });
    serve();
    server.use(http.get(OWN_ENDPOINT, () => HttpResponse.json({ error }, { status })));
  }

  it('explains the outage when the vector store is unreachable', async () => {
    serveOwn(503, 'vector_store_unavailable');

    renderWithProviders(<WissenDashboard />);

    expect(await screen.findByText(NOTICE, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('stays silent on an unrelated server error', async () => {
    serveOwn(500, 'Internal server error');

    renderWithProviders(<WissenDashboard />);

    expect(await screen.findByText('Neues erstellen')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 1500));
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });
});

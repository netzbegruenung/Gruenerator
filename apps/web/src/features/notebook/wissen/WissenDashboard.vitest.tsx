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
const MONITOR_EU_GREENS = 'http://localhost/api/monitor/polls/eu-greens';
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
  euGreens?: Record<string, unknown>;
  entity?: Record<string, unknown> | null;
}

/** Answers every endpoint the dashboard reads; empty by default. */
function serve({
  saved = [],
  shared = [],
  monitor = { topics: [] },
  feed = EMPTY_FEED,
  polls = { average: {} },
  euGreens = { results: [], fetchedAt: '2026-11-06T08:00:00Z' },
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
    http.get(MONITOR_EU_GREENS, () => HttpResponse.json(euGreens)),
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

  it('expands the Landesverbände tile into a row of Marktplatz photos', async () => {
    serve();

    const { user } = renderWithProviders(<WissenDashboard />);

    const row = await openShelf(user, /Landesverbände/);
    expect(within(row).getByRole('link', { name: /Berlin/ })).toBeInTheDocument();
    const photos = [...row.querySelectorAll('img')].map((img) => img.getAttribute('src'));
    expect(photos.length).toBeGreaterThan(0);
    expect(photos.every((src) => src?.startsWith('/images/marketplace/landesverbaende/'))).toBe(
      true
    );
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
    expect(screen.queryByRole('button', { name: /Landesverbände/ })).not.toBeInTheDocument();
  });
});

describe('WissenDashboard — Nachrichten und Kennzahlen', () => {
  it('mixes Feed and Watcher in the headline slider, Feed first', async () => {
    serve({ feed: FEED, entity: ENTITY });

    renderWithProviders(<WissenDashboard />);

    const slider = await screen.findByRole('region', { name: 'Briefing' });
    const slides = await within(slider).findAllByRole('article');
    expect(slides.map((s) => s.querySelector('h3')?.textContent)).toEqual([
      'Landesparteitag beschliesst Wohnraumprogramm',
      'Grüne fordern Klimageld',
    ]);
    // Absender und Zeit über der Schlagzeile, ohne den Namen des Stroms davor.
    expect(slides[0]).toHaveTextContent(/^Grüne Bayern · vor /);
    expect(slides[0]).not.toHaveTextContent(/Feed|Watcher/);
    // Only the visible slide is reachable.
    expect(slides[1]).toHaveAttribute('inert');
  });

  // Watcher und Feed sind seit 07.11.2026 Karten auf /briefing; dorthin führt die Überschrift.
  it('titles the slider „Briefing" and links it to /briefing, also for Austrian users', async () => {
    useAuthStore.setState({ locale: 'de-AT' });
    serve({ entity: ENTITY });

    renderWithProviders(<WissenDashboard />);

    const slider = await screen.findByRole('region', { name: 'Briefing' });
    const title = within(slider).getByRole('heading', { name: 'Briefing' });
    expect(within(title).getByRole('link')).toHaveAttribute('href', '/briefing');
    expect(within(slider).queryByRole('link', { name: /Watcher|Feed/ })).not.toBeInTheDocument();
  });

  it('shows the top keywords under „Trends"', async () => {
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

    const card = await screen.findByRole('region', { name: 'Trends' });
    expect(await within(card).findByText('Kohleausstieg')).toBeInTheDocument();
    expect(within(card).getByText('Klimageld')).toBeInTheDocument();
    // Öffnet auf /briefing gleich die Keyword-Karte.
    expect(within(card).getByRole('link', { name: 'Trends' })).toHaveAttribute(
      'href',
      '/briefing?karte=keywords'
    );
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

    for (const name of ['Briefing', 'Umfragen', 'Trends']) {
      const region = await screen.findByRole('region', { name });
      expect(region).toHaveAttribute('aria-busy', 'true');
      expect(region.querySelector('[data-slot="skeleton"]')).not.toBeNull();
    }
  });

  it('rotates the polls into the strongest Greens in Europe, navigable by dots', async () => {
    const eu = (countryCode: string, countryName: string, percent: number, extra = {}) => ({
      countryCode,
      countryName,
      party: 'Grüne',
      percent,
      diff: null,
      electionDiff: null,
      date: '2026-11-01',
      note: null,
      ...extra,
    });
    serve({
      polls: {
        polls: [{ institute: 'INSA', date: '2026-11-01', parties: {} }],
        lastElection: null,
        average: { GRÜNE: 15.2, 'CDU/CSU': 20.1 },
        scrapedAt: '2026-11-06T08:00:00Z',
      },
      euGreens: {
        results: [
          eu('de', 'Deutschland', 15.2),
          eu('eu', 'EU-Parlament', 9),
          eu('fr', 'Frankreich', 25, { broadAlliance: true }),
          eu('fi', 'Finnland', 12),
          eu('se', 'Schweden', 6),
          eu('nl', 'Niederlande', 14),
          eu('lu', 'Luxemburg', 10),
          eu('ie', 'Irland', 4),
        ],
        fetchedAt: '2026-11-06T08:00:00Z',
      },
    });

    const { user } = renderWithProviders(<WissenDashboard />);

    const card = await screen.findByRole('region', { name: 'Umfragen' });
    const europe = await within(card).findByLabelText('Grüne in Europa', { selector: 'div' });
    // Ohne das eigene Land, das EU-Parlament und breite Bündnisse; stärkste zuerst.
    expect(
      within(europe)
        .getAllByRole('listitem')
        .map((li) => li.textContent)
    ).toEqual(['Niederlande14,0%', 'Finnland12,0%', 'Luxemburg10,0%', 'Schweden6,0%']);
    const national = within(card).getByLabelText('Umfragen in Deutschland', { selector: 'div' });
    expect(europe).toHaveAttribute('inert');

    await user.click(within(card).getByRole('button', { name: 'Grüne in Europa' }));
    expect(europe).not.toHaveAttribute('inert');
    expect(national).toHaveAttribute('inert');
    expect(within(card).getByRole('button', { name: 'Grüne in Europa' })).toHaveAttribute(
      'aria-current',
      'true'
    );
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

    const slider = await screen.findByRole('region', { name: 'Briefing' });
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

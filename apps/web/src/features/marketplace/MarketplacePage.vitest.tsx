/**
 * `/marktplatz`: „Start" als Startseite, Reiter nach Art, Herkunft und
 * Sortierung in der Adresse, ein Abschnitt je Art, sobald gesucht oder
 * gefiltert wird, der Landesverband nur mit Rolle, und eine Kachel öffnet ihre
 * Details an Ort und Stelle.
 */
import { type MarketplaceItem, type MarketplaceSection } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { item, sectionsResponse } from '../../test/marketplaceFixtures';
import { server } from '../../test/msw-server';

import MarketplacePage from './MarketplacePage';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen, waitFor, within } from '@/test-utils';

const API = 'http://localhost/api/marketplace';

const lv = vi.hoisted(() => ({ ids: null as readonly string[] | null }));
vi.mock('@gruenerator/chat', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useUserLandesverbaende: () => ({
    lvIds: lv.ids,
    headings: { agents: '', skills: '' },
    shelfLabel: '',
    isHydrated: true,
  }),
}));

let queries: URLSearchParams[] = [];
let savedRefs = new Set<string>();
let respond: (params: URLSearchParams) => MarketplaceSection[] = () => [];

const FEATURED = item('agent', 'Leichte Sprache', {
  ref: 'gruenerator-leichte-sprache',
  origin: 'offiziell',
});

const ALL: MarketplaceItem[] = [
  item('agent', 'Pressearbeit', { origin: 'offiziell' }),
  item('recipe', 'Fremdes Rezept', { origin: 'oeffentlich', authorName: 'Sam Beispiel' }),
  item('sticker', 'Sonnenblume', { authorName: 'Kim' }),
];

/** Like the server: the asked kinds, filtered by origin and search. */
function serveFrom(items: MarketplaceItem[], hasMore = false) {
  respond = (params) => {
    const kinds = params.get('kinds')?.split(',') ?? [];
    const origin = params.get('origin');
    const q = params.get('q')?.toLowerCase() ?? '';
    return kinds.map((kind) => ({
      kind: kind as MarketplaceItem['kind'],
      items: items
        .filter(
          (i) =>
            i.kind === kind && (!origin || i.origin === origin) && i.title.toLowerCase().includes(q)
        )
        .map((i) => ({ ...i, saved: savedRefs.has(i.ref) })),
      hasMore,
    }));
  };
}

function Where() {
  return <output aria-label="Adresse">{useLocation().search}</output>;
}

const renderPage = (route = '/marktplatz') =>
  renderWithProviders(
    <Routes>
      <Route
        path="/marktplatz"
        element={
          <>
            <MarketplacePage />
            <Where />
          </>
        }
      />
    </Routes>,
    { route }
  );

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1' } as never, locale: 'de-DE' });
  localStorage.clear();
  lv.ids = null;
  queries = [];
  savedRefs = new Set();
  serveFrom(ALL);
  server.use(
    http.get(API, ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      return HttpResponse.json(sectionsResponse(respond(params)));
    }),
    http.get(`${API}/agent/gruenerator-leichte-sprache`, () =>
      HttpResponse.json({ item: FEATURED })
    ),
    http.get('http://localhost/api/comments/:type/:id', () =>
      HttpResponse.json({ success: true, reactions: [], comments: [] })
    )
  );
});

describe('MarketplacePage', () => {
  it('opens on „Start": the featured item, then only the shelves that have enough', async () => {
    renderPage();

    const focus = await screen.findByRole('region', { name: 'Leichte Sprache' });
    expect(within(focus).getByRole('link', { name: 'Im Chat ausprobieren' })).toHaveAttribute(
      'href',
      '/agents/presse'
    );
    const fresh = await screen.findByRole('region', { name: 'Neu im Marktplatz' });
    expect(within(fresh).getByRole('heading', { name: 'Pressearbeit' })).toBeInTheDocument();
    expect(within(fresh).getByText('Rezept · Sam Beispiel')).toBeInTheDocument();
    // Below their minimum: no likes yet, one image, no Landesverband.
    expect(screen.queryByRole('region', { name: 'Beliebt' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Zum Gestalten' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Aus deinem Landesverband' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Nach Art stöbern' })).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Start' })).toHaveAttribute('aria-pressed', 'true');
    const asked = queries.map((q) => `${q.get('kinds')}|${q.get('sort')}`);
    expect(asked).toEqual(
      expect.arrayContaining([
        'agent,recipe|neu',
        'agent,recipe|beliebt',
        'template,sticker,background|empfohlen',
      ])
    );
    // The per-kind list is not asked for while the front page shows.
    expect(asked).not.toContain('agent,recipe,template,sticker,background|empfohlen');
  });

  it('gives way to one section per kind as soon as someone searches', async () => {
    renderPage('/marktplatz?q=e');

    const agents = await screen.findByRole('region', { name: 'Agents' });
    expect(within(agents).getByRole('heading', { name: 'Pressearbeit' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Rezepte' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Neu im Marktplatz' })).toBeNull();
    expect(Object.fromEntries(queries.at(-1)!)).toMatchObject({
      kinds: 'agent,recipe,template,sticker,background',
      q: 'e',
      sectionLimit: '12',
    });
  });

  it('shows „Beliebt" and „Zum Gestalten" once there is enough', async () => {
    serveFrom([
      ...[1, 2, 3, 4, 5].map((n) => item('agent', `Agent ${n}`, { likesCount: n })),
      item('template', 'Plakat'),
      item('sticker', 'Sonne'),
      item('background', 'Wiese'),
    ]);
    renderPage();

    const popular = await screen.findByRole('region', { name: 'Beliebt' });
    const rows = within(popular).getAllByRole('listitem');
    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('Agent 5');
    expect(screen.getByRole('region', { name: 'Zum Gestalten' })).toBeInTheDocument();
  });

  it('shows the Landesverband shelf only with a role', async () => {
    lv.ids = ['hessen'];
    serveFrom([
      item('agent', 'LV-Agent', { origin: 'landesverband' }),
      item('recipe', 'LV-Rezept', { origin: 'landesverband' }),
    ]);
    renderPage();

    const shelf = await screen.findByRole('region', { name: 'Aus deinem Landesverband' });
    expect(
      within(shelf).getByRole('heading', { name: 'Aus deinem Landesverband · Grüne Hessen' })
    ).toBeInTheDocument();
    expect(within(shelf).getAllByRole('heading', { level: 3 })).toHaveLength(2);
    // One Landesverband: „Alle anzeigen" opens its page.
    expect(within(shelf).getByRole('link', { name: 'Alle anzeigen' })).toHaveAttribute(
      'href',
      '/marktplatz/landesverband/gruene-hessen'
    );
  });

  it('keeps „Alle anzeigen" on the filtered list with several Landesverbände', async () => {
    lv.ids = ['hessen', 'berlin'];
    serveFrom([
      item('agent', 'LV-Agent', { origin: 'landesverband' }),
      item('recipe', 'LV-Rezept', { origin: 'landesverband' }),
    ]);
    const { user } = renderPage();

    const shelf = await screen.findByRole('region', { name: 'Aus deinem Landesverband' });
    expect(within(shelf).queryByRole('link', { name: 'Alle anzeigen' })).toBeNull();
    await user.click(within(shelf).getByRole('button', { name: 'Alle anzeigen' }));
    expect(screen.getByRole('status', { name: 'Adresse' })).toHaveTextContent('von=landesverband');
  });

  it('does not show the featured item a second time under „Beliebt"', async () => {
    serveFrom([
      { ...FEATURED, likesCount: 9 },
      ...[1, 2, 3, 4, 5].map((n) => item('agent', `Agent ${n}`, { likesCount: n })),
    ]);
    renderPage();

    await screen.findByRole('region', { name: 'Leichte Sprache' });
    const popular = await screen.findByRole('region', { name: 'Beliebt' });
    expect(within(popular).queryByText('Leichte Sprache')).toBeNull();
    expect(within(popular).getAllByRole('listitem')).toHaveLength(5);
  });

  it('falls back to the newest official item when the featured one is not there', async () => {
    server.use(
      http.get(`${API}/agent/gruenerator-leichte-sprache`, () =>
        HttpResponse.json({ success: false, message: 'Element nicht gefunden.' }, { status: 404 })
      )
    );
    renderPage();

    const focus = await screen.findByRole('region', { name: 'Pressearbeit' });
    expect(within(focus).getByText('Neu im Marktplatz')).toBeInTheDocument();
    // The focused item is not shown a second time.
    const fresh = await screen.findByRole('region', { name: 'Neu im Marktplatz' });
    expect(within(fresh).queryByRole('heading', { name: 'Pressearbeit' })).toBeNull();
  });

  it('switches to one kind through its tab or „Alle anzeigen", pages it, and keeps it in the address', async () => {
    serveFrom(ALL, true);
    const { user } = renderPage();
    const kinds = await screen.findByRole('region', { name: 'Nach Art stöbern' });

    await user.click(within(kinds).getByRole('button', { name: /Rezepte/ }));

    expect(screen.getByRole('button', { name: 'Rezepte' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Adresse')).toHaveTextContent('?art=rezepte');
    await waitFor(() => expect(queries.at(-1)?.get('kinds')).toBe('recipe'));
    expect(Object.fromEntries(queries.at(-1)!)).toMatchObject({ offset: '0', limit: '24' });

    await user.click(await screen.findByRole('button', { name: 'Mehr laden' }));
    await waitFor(() => expect(queries.at(-1)?.get('offset')).toBe('24'));
  });

  it('reads tab, search and sort from the address', async () => {
    renderPage('/marktplatz?art=sticker&q=sonne&sort=neu');

    expect(await screen.findByRole('heading', { name: 'Sonnenblume' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sticker' })).toHaveAttribute('aria-pressed', 'true');
    expect(Object.fromEntries(queries.at(-1)!)).toMatchObject({
      kinds: 'sticker',
      q: 'sonne',
      sort: 'neu',
    });
    // Sticker have no origin, so there is no origin filter.
    expect(screen.queryByRole('button', { name: /^Herkunft/ })).toBeNull();
  });

  it('filters by origin and shows the filter as a chip', async () => {
    const { user } = renderPage();
    await screen.findByRole('region', { name: 'Neu im Marktplatz' });

    await user.click(screen.getByRole('button', { name: 'Herkunft' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Offiziell' }));

    expect(screen.getByLabelText('Adresse')).toHaveTextContent('?von=offiziell');
    await waitFor(() => expect(queries.at(-1)?.get('origin')).toBe('offiziell'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Rezepte' })).toBeNull());
    expect(
      screen.getByRole('button', { name: 'Filter „Offiziell“ entfernen' })
    ).toBeInTheDocument();
  });

  it('names the Landesverband after the person’s own, and offers it only with a role', async () => {
    const { user, unmount } = renderPage();
    await screen.findByRole('region', { name: 'Neu im Marktplatz' });
    await user.click(screen.getByRole('button', { name: 'Herkunft' }));
    expect(screen.queryByRole('menuitemradio', { name: /Grüne|Landesverband/ })).toBeNull();
    unmount();

    lv.ids = ['hessen'];
    const second = renderPage();
    await screen.findByRole('region', { name: 'Neu im Marktplatz' });
    await second.user.click(screen.getByRole('button', { name: 'Herkunft' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Grüne Hessen' })).toBeInTheDocument();
  });

  it('says so when a kind or a search finds nothing', async () => {
    serveFrom([]);
    const { unmount } = renderPage('/marktplatz?art=agents');
    expect(await screen.findByText('Hier ist gerade nichts')).toBeInTheDocument();
    expect(screen.getByText('Hier gibt es noch keine Agents.')).toBeInTheDocument();
    unmount();

    renderPage('/marktplatz?q=xyz');
    expect(await screen.findByText('Keine Treffer für „xyz“.')).toBeInTheDocument();
  });

  it('keeps an empty catalogue’s front page to the ways in', async () => {
    serveFrom([]);
    server.use(
      http.get(`${API}/agent/gruenerator-leichte-sprache`, () =>
        HttpResponse.json({ success: false, message: 'Element nicht gefunden.' }, { status: 404 })
      )
    );
    renderPage();

    expect(await screen.findByRole('region', { name: 'Nach Art stöbern' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Du hast ein Rezept, das funktioniert?' })
    ).toBeInTheDocument();
    await waitFor(() => expect(queries.length).toBeGreaterThan(0));
    expect(screen.queryByRole('region', { name: 'Neu im Marktplatz' })).toBeNull();
  });

  it('opens a tile in place and saves it to „Meine Grüneratoren"', async () => {
    const save = vi.fn();
    server.use(
      http.put(`${API}/:kind/:ref/save`, ({ params }) => {
        save(params.kind, params.ref);
        savedRefs.add(String(params.ref));
        return HttpResponse.json({ saved: true });
      })
    );
    const { user } = renderPage();
    const fresh = await screen.findByRole('region', { name: 'Neu im Marktplatz' });

    await user.click(within(fresh).getByRole('button', { name: 'Pressearbeit' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Pressearbeit' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse')).toHaveTextContent('?item=agent%3Aagent-pressearbeit');
    expect(screen.getByRole('link', { name: 'Alle Details' })).toHaveAttribute(
      'href',
      '/agentura/agent/presse'
    );
    await user.click(screen.getByRole('button', { name: 'Zu meinen Grüneratoren' }));
    expect(await screen.findByRole('button', { name: 'In meinen Grüneratoren' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await waitFor(() => expect(save).toHaveBeenCalledWith('agent', 'agent-pressearbeit'));

    await user.click(screen.getByRole('button', { name: 'Zurück zum Marktplatz' }));
    expect(await screen.findByRole('region', { name: 'Neu im Marktplatz' })).toBeInTheDocument();
    expect(screen.getByLabelText('Adresse')).toBeEmptyDOMElement();
  });

  it('opens a shared link’s item directly, and copies a link back to it', async () => {
    const vorlage = item('template', 'Plakat', { ref: 'tpl-1', authorName: 'Kim' });
    if (vorlage.kind !== 'template') throw new Error('fixture');
    vorlage.template.images = [
      { url: 'https://example.org/1.png', title: null },
      { url: 'https://example.org/2.png', title: null },
    ];
    const asked = vi.fn();
    server.use(
      http.get(`${API}/:kind/:ref`, ({ params }) => {
        asked(params.kind, params.ref);
        return HttpResponse.json({ item: vorlage });
      })
    );
    const { user } = renderPage('/marktplatz?art=vorlagen&item=template%3Atpl-1');

    expect(await screen.findByRole('heading', { level: 2, name: 'Plakat' })).toBeInTheDocument();
    expect(asked).toHaveBeenCalledWith('template', 'tpl-1');

    // The Vorlage's own part of the detail: every page, the chosen one large.
    const pages = screen.getByRole('group', { name: 'Seiten' });
    const second = within(pages).getByRole('button', { name: 'Seite 2 von 2 anzeigen' });
    await user.click(second);
    expect(second).toHaveAttribute('aria-current', 'true');
    expect(within(pages).getByRole('button', { name: 'Seite 1 von 2 anzeigen' })).toHaveAttribute(
      'aria-current',
      'false'
    );

    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    await user.click(screen.getByRole('button', { name: 'Link kopieren' }));
    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/marktplatz?art=vorlagen&item=template%3Atpl-1`
    );
    expect(await axe(pages)).toHaveNoViolations();
    expect(
      await axe(screen.getByRole('region', { name: 'Reaktionen und Kommentare' }))
    ).toHaveNoViolations();
  });

  it('says so when a shared item is gone', async () => {
    server.use(
      http.get(`${API}/:kind/:ref`, () =>
        HttpResponse.json({ success: false, message: 'Element nicht gefunden.' }, { status: 404 })
      )
    );
    const { user } = renderPage('/marktplatz?item=agent%3Aweg');

    expect(await screen.findByText('Dieser Eintrag ist nicht verfügbar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zurück zum Marktplatz' }));
    expect(await screen.findByRole('region', { name: 'Neu im Marktplatz' })).toBeInTheDocument();
  });

  it('reports someone else’s item from the detail, but not official content', async () => {
    const { user } = renderPage();
    const fresh = await screen.findByRole('region', { name: 'Neu im Marktplatz' });
    await user.click(within(fresh).getByRole('button', { name: 'Fremdes Rezept' }));
    await user.click(await screen.findByRole('button', { name: 'Melden' }));
    expect(await screen.findByRole('dialog', { name: 'Inhalt melden' })).toBeInTheDocument();
  });

  it('offers to start one’s own Agent, Rezept, Vorlage or Sticker from „+"', async () => {
    const { user } = renderPage();
    await user.click(screen.getByRole('button', { name: 'Inhalt hinzufügen' }));
    const items = await screen.findAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Agent', 'Rezept', 'Vorlage', 'Sticker']);
  });

  it('has no axe violations', async () => {
    const { container } = renderPage();
    await screen.findByRole('region', { name: 'Leichte Sprache' });
    await screen.findByRole('region', { name: 'Neu im Marktplatz' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('nests the opened item under the page heading, with no axe violations', async () => {
    const { container } = renderPage('/marktplatz?item=agent%3Aagent-pressearbeit');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Pressearbeit' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Kommentare' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

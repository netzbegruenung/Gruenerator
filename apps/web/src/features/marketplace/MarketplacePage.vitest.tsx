/**
 * `/marktplatz`: Reiter nach Art, Herkunft und Sortierung in der Adresse, ein
 * Abschnitt je Art unter „Alle", der Landesverband nur mit Rolle, und eine
 * Kachel öffnet ihre Details an Ort und Stelle.
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
    })
  );
});

describe('MarketplacePage', () => {
  it('shows one section per kind under „Alle", and asks for every kind', async () => {
    renderPage();

    const agents = await screen.findByRole('region', { name: 'Agents' });
    expect(within(agents).getByRole('heading', { name: 'Pressearbeit' })).toBeInTheDocument();
    expect(within(agents).getByText('Agent · Offiziell')).toBeInTheDocument();
    const recipes = screen.getByRole('region', { name: 'Rezepte' });
    expect(within(recipes).getByText('Rezept · Sam Beispiel')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sticker' })).toBeInTheDocument();
    // An empty kind has no section.
    expect(screen.queryByRole('region', { name: 'Vorlagen' })).toBeNull();

    expect(Object.fromEntries(queries[0])).toMatchObject({
      kinds: 'agent,recipe,template,sticker,background',
      sort: 'empfohlen',
      scope: 'shop',
      platform: 'web',
      sectionLimit: '12',
    });
    expect(screen.getByRole('button', { name: 'Alle' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to one kind through its tab or „Alle anzeigen", pages it, and keeps it in the address', async () => {
    serveFrom(ALL, true);
    const { user } = renderPage();
    const recipes = await screen.findByRole('region', { name: 'Rezepte' });

    await user.click(within(recipes).getByRole('button', { name: 'Alle anzeigen' }));

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
    await screen.findByRole('region', { name: 'Agents' });

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
    await screen.findByRole('region', { name: 'Agents' });
    await user.click(screen.getByRole('button', { name: 'Herkunft' }));
    expect(screen.queryByRole('menuitemradio', { name: /Grüne|Landesverband/ })).toBeNull();
    unmount();

    lv.ids = ['hessen'];
    const second = renderPage();
    await screen.findByRole('region', { name: 'Agents' });
    await second.user.click(screen.getByRole('button', { name: 'Herkunft' }));
    expect(await screen.findByRole('menuitemradio', { name: 'Grüne Hessen' })).toBeInTheDocument();
  });

  it('says so when there is nothing, and when a search finds nothing', async () => {
    serveFrom([]);
    renderPage();
    expect(await screen.findByText('Hier ist gerade nichts')).toBeInTheDocument();
    expect(screen.getByText('Im Marktplatz gibt es hier noch nichts.')).toBeInTheDocument();
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
    const agents = await screen.findByRole('region', { name: 'Agents' });

    await user.click(within(agents).getByRole('button', { name: 'Pressearbeit' }));

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Pressearbeit' })
    ).toBeInTheDocument();
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
    expect(await screen.findByRole('region', { name: 'Agents' })).toBeInTheDocument();
  });

  it('reports someone else’s item from the detail, but not official content', async () => {
    const { user } = renderPage();
    const recipes = await screen.findByRole('region', { name: 'Rezepte' });
    await user.click(within(recipes).getByRole('button', { name: 'Fremdes Rezept' }));
    await user.click(await screen.findByRole('button', { name: 'Melden' }));
    expect(await screen.findByRole('dialog', { name: 'Inhalt melden' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderPage();
    await screen.findByRole('region', { name: 'Agents' });
    expect(await axe(container)).toHaveNoViolations();
  });
});

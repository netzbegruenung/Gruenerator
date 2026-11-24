/**
 * `/marktplatz/landesverband/<slug>`: die Seite eines Landesverbands — Cover,
 * Notebook und seine Rezepte in Hub-Reihenfolge (seit 11/2026 ohne Agents). Aufgelöst
 * wird über dasselbe Gate wie `/agents/<slug>`, ein abgeschalteter
 * Landesverband ist deshalb hier genauso „nicht verfügbar".
 */
import { type MarketplaceItem, type MarketplaceSection } from '@gruenerator/contracts';
import { getLandesverbandHubBySlug } from '@gruenerator/shared/agents';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { item, sectionsResponse } from '../../test/marketplaceFixtures';
import { server } from '../../test/msw-server';
import { getNotebookById } from '../notebook/config/notebooksConfig';

import MarketplaceLandesverbandPage from './MarketplaceLandesverbandPage';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen, waitFor, within } from '@/test-utils';

const API = 'http://localhost/api/marketplace';

const berlin = getLandesverbandHubBySlug('gruene-berlin', 'production')!;
const systemRecipe = (mention: string, title: string): MarketplaceItem => {
  const it = item('recipe', title, { ref: mention, origin: 'landesverband' });
  return it.kind === 'recipe' ? { ...it, recipe: { ...it.recipe, mention, system: true } } : it;
};

// Deliberately out of hub order: the page sorts them by their owning agent.
const BERLIN_RECIPES: MarketplaceItem[] = [
  systemRecipe('buerger-berlin', 'Bürger-Mail Berlin'),
  systemRecipe('presse-berlin-partei', 'PM Berlin (Partei)'),
];

let queries: URLSearchParams[] = [];
let recipes: MarketplaceItem[] = [];

function Where() {
  return <output aria-label="Adresse">{useLocation().search}</output>;
}

const renderPage = (slug: string) =>
  renderWithProviders(
    <Routes>
      <Route
        path="/marktplatz/landesverband/:slug"
        element={
          <>
            <MarketplaceLandesverbandPage />
            <Where />
          </>
        }
      />
    </Routes>,
    { route: `/marktplatz/landesverband/${slug}` }
  );

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1' } as never, locale: 'de-DE' });
  queries = [];
  recipes = BERLIN_RECIPES;
  server.use(
    http.get(API, ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      const sections: MarketplaceSection[] = [{ kind: 'recipe', items: recipes, hasMore: false }];
      return HttpResponse.json(sectionsResponse(sections));
    }),
    http.get('http://localhost/api/comments/:type/:id', () =>
      HttpResponse.json({ success: true, reactions: [], comments: [] })
    )
  );
});

describe('MarketplaceLandesverbandPage', () => {
  it('shows the photo, the way into the notebook and the recipes in hub order', async () => {
    const { container } = renderPage('gruene-berlin');

    expect(screen.getByRole('heading', { level: 1, name: 'Grüne Berlin' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Das Brandenburger Tor mit dem Fernsehturm dahinter' })
    ).toHaveAttribute('src', '/images/marketplace/landesverbaende/berlin-v1-640.webp');

    // The notebook is a text link in the intro, not a card of its own.
    const notebook = getNotebookById(berlin.notebookId)!;
    expect(screen.getByRole('link', { name: 'Zum Notebook' })).toHaveAttribute(
      'href',
      notebook.path
    );
    expect(screen.queryByRole('region', { name: 'Notebook' })).toBeNull();

    const recipeSection = await screen.findByRole('region', { name: 'Rezepte' });
    await within(recipeSection).findByRole('heading', { name: 'PM Berlin (Partei)' });
    expect(
      within(recipeSection)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent)
    ).toEqual(['PM Berlin (Partei)', 'Bürger-Mail Berlin']);
    expect(screen.queryByRole('region', { name: 'Agents' })).toBeNull();

    // Only recipes are asked for, for exactly this Landesverband.
    expect(queries.map((q) => `${q.get('kinds')}|${q.get('origin')}|${q.get('lv')}`)).toEqual([
      'recipe|landesverband|berlin',
    ]);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('hides an empty section', async () => {
    recipes = [];
    renderPage('gruene-berlin');

    await waitFor(() => expect(queries.length).toBeGreaterThan(0));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Rezepte' })).toBeNull());
  });

  it('opens a recipe in place and comes back to the Landesverband', async () => {
    const { user } = renderPage('gruene-berlin');

    const recipeSection = await screen.findByRole('region', { name: 'Rezepte' });
    await user.click(
      await within(recipeSection).findByRole('button', { name: /PM Berlin \(Partei\)/ })
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'PM Berlin (Partei)' })
    ).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Adresse' })).toHaveTextContent(
      '?item=recipe%3Apresse-berlin-partei'
    );

    await user.click(screen.getByRole('button', { name: 'Grüne Berlin' }));
    expect(await screen.findByRole('region', { name: 'Rezepte' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Adresse' })).toHaveTextContent('');
  });

  it('says „nicht verfügbar" for an unknown slug, without asking the API', async () => {
    const { container } = renderPage('gruene-atlantis');

    expect(screen.getByText('Dieser Landesverband ist nicht verfügbar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zum Marktplatz' })).toHaveAttribute(
      'href',
      '/marktplatz'
    );
    expect(queries).toEqual([]);
    expect(await axe(container)).toHaveNoViolations();
  });

  // Hamburg switched its notebook off (`enabled: false`): the hub entry stays
  // in the registry so the cascade can hide its agents — the page must not
  // bring them back.
  it('says „nicht verfügbar" for a switched-off Landesverband', () => {
    renderPage('gruene-hamburg');

    expect(screen.getByText('Dieser Landesverband ist nicht verfügbar')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Rezepte' })).toBeNull();
    expect(queries).toEqual([]);
  });

  it('keeps each country to its own: AT sees Österreich, not Berlin', async () => {
    useAuthStore.setState({ locale: 'de-AT' });
    recipes = [];
    const first = renderPage('gruene-berlin');
    expect(screen.getByText('Dieser Landesverband ist nicht verfügbar')).toBeInTheDocument();
    first.unmount();

    renderPage('gruene-oesterreich');
    expect(screen.getByRole('heading', { level: 1, name: 'Grüne Österreich' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zum Notebook' })).toBeInTheDocument();
    await waitFor(() =>
      expect(queries.map((q) => q.get('lv'))).toEqual(
        expect.arrayContaining(['oesterreich', 'oesterreich'])
      )
    );
  });
});

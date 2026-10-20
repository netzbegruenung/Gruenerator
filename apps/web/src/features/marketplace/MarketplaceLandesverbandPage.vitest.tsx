/**
 * `/marktplatz/landesverband/<slug>`: die Seite eines Landesverbands — Cover,
 * Notebook, Agents in Hub-Reihenfolge, Rezepte und die Anleitung. Aufgelöst
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
const [prAgent, buergerAgent] = berlin.agentIds;

const agent = (ref: string, title: string) =>
  item('agent', title, { ref, origin: 'landesverband', audience: 'de-DE' });

// Deliberately out of hub order: the page sorts them.
const BERLIN_AGENTS: MarketplaceItem[] = [
  agent(buergerAgent, 'Bürger*innenanfragen Berlin'),
  agent(prAgent, 'Öffentlichkeitsarbeit Berlin'),
];
const recipe = item('recipe', 'Bürger-Mail Berlin', {
  ref: 'buerger-berlin',
  origin: 'landesverband',
});
const BERLIN_RECIPES: MarketplaceItem[] = [
  recipe.kind === 'recipe'
    ? { ...recipe, recipe: { ...recipe.recipe, mention: 'buerger-berlin', system: true } }
    : recipe,
];

let queries: URLSearchParams[] = [];
let agents: MarketplaceItem[] = [];
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
  agents = BERLIN_AGENTS;
  recipes = BERLIN_RECIPES;
  server.use(
    http.get(API, ({ request }) => {
      const params = new URL(request.url).searchParams;
      queries.push(params);
      const kind = params.get('kinds');
      const sections: MarketplaceSection[] = [
        {
          kind: kind === 'recipe' ? 'recipe' : 'agent',
          items: kind === 'recipe' ? recipes : agents,
          hasMore: false,
        },
      ];
      return HttpResponse.json(sectionsResponse(sections));
    }),
    http.get('http://localhost/api/comments/:type/:id', () =>
      HttpResponse.json({ success: true, reactions: [], comments: [] })
    )
  );
});

describe('MarketplaceLandesverbandPage', () => {
  it('shows the photo, the way into the notebook, agents in hub order and recipes', async () => {
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

    const agentSection = await screen.findByRole('region', { name: 'Agents' });
    await within(agentSection).findByRole('heading', { name: 'Öffentlichkeitsarbeit Berlin' });
    expect(
      within(agentSection)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent)
    ).toEqual(['Öffentlichkeitsarbeit Berlin', 'Bürger*innenanfragen Berlin']);
    const recipeSection = await screen.findByRole('region', { name: 'Rezepte' });
    expect(
      await within(recipeSection).findByRole('heading', { name: 'Bürger-Mail Berlin' })
    ).toBeVisible();

    // Both aisles ask for exactly this Landesverband.
    expect(queries.map((q) => `${q.get('kinds')}|${q.get('origin')}|${q.get('lv')}`)).toEqual(
      expect.arrayContaining(['agent|landesverband|berlin', 'recipe|landesverband|berlin'])
    );

    expect(await axe(container)).toHaveNoViolations();
  });

  it('hides an empty section', async () => {
    recipes = [];
    renderPage('gruene-berlin');

    await screen.findByRole('heading', { name: 'Öffentlichkeitsarbeit Berlin' });
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Rezepte' })).toBeNull());
    expect(screen.getByRole('region', { name: 'Agents' })).toBeInTheDocument();
  });

  it('opens an agent in place and comes back to the Landesverband', async () => {
    const { user } = renderPage('gruene-berlin');

    const agentSection = await screen.findByRole('region', { name: 'Agents' });
    await user.click(
      await within(agentSection).findByRole('button', { name: /Öffentlichkeitsarbeit Berlin/ })
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Öffentlichkeitsarbeit Berlin' })
    ).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Adresse' })).toHaveTextContent(
      `?item=agent%3A${prAgent}`
    );

    await user.click(screen.getByRole('button', { name: 'Zurück zu Grüne Berlin' }));
    expect(await screen.findByRole('region', { name: 'Agents' })).toBeInTheDocument();
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
    expect(screen.queryByRole('region', { name: 'Agents' })).toBeNull();
    expect(queries).toEqual([]);
  });

  it('keeps each country to its own: AT sees Österreich, not Berlin', async () => {
    useAuthStore.setState({ locale: 'de-AT' });
    agents = [];
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

import { type SharepicVorlage } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import VorlagenGallery from './VorlagenGallery';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders } from '@/test-utils';

const API = 'http://localhost/api';

const galleryItem = (id: string, title: string) => ({
  id,
  title,
  template_type: 'canva',
  external_url: `https://canva.com/${id}`,
});

const catalogVorlage = (id: string, titel: string): SharepicVorlage => ({
  id,
  locale: 'de-DE',
  titel,
  beschreibung: 'Ein Zitat auf Grün.',
  form: 'zitat',
  herkunft: 'alt-template',
  chat: { prompts: ['Erstelle ein Zitat-Sharepic'] },
  attributions: [null],
  spec: {
    locale: 'de-DE',
    slides: [
      {
        background: { kind: 'farbe', color: 'tanne' },
        position: 'mitte',
        align: 'links',
        items: [{ type: 'headline', lines: ['Bus statt Stau'] }],
        logo: true,
      },
    ],
  },
});

let galleryQueries: URLSearchParams[] = [];
let catalogQueries: string[] = [];

function serve({
  favoriteIds = [] as string[],
  gallery = [galleryItem('g1', 'Plakat Klima'), galleryItem('g2', 'Flyer Radweg')],
  catalog = [] as SharepicVorlage[],
} = {}) {
  galleryQueries = [];
  catalogQueries = [];
  server.use(
    http.get('*/api/auth/vorlagen', ({ request }) => {
      galleryQueries.push(new URL(request.url).searchParams);
      return HttpResponse.json({ vorlagen: gallery });
    }),
    http.get('*/api/auth/vorlagen-categories', () =>
      HttpResponse.json({ categories: [{ id: 'canva', label: 'Canva' }] })
    ),
    http.get(`${API}/sharepic-vorlagen`, ({ request }) => {
      catalogQueries.push(new URL(request.url).search);
      return HttpResponse.json({ vorlagen: catalog });
    }),
    http.get(`${API}/auth/templates/favorites`, () =>
      HttpResponse.json({ success: true, favorite_ids: favoriteIds, templates: [] })
    ),
    http.get(`${API}/auth/templates/likes`, () =>
      HttpResponse.json({ success: true, liked_ids: [] })
    ),
    http.get(`${API}/auth/templates/engagement`, ({ request }) => {
      const ids = new URL(request.url).searchParams.get('ids')?.split(',') ?? [];
      return HttpResponse.json({
        success: true,
        items: ids.map((id) => ({ id, likes_count: 0, reactions: [] })),
      });
    }),
    http.get(`${API}/auth/user-templates`, () =>
      HttpResponse.json({
        success: true,
        data: [{ id: 'mine-1', title: 'Mein Canva-Plakat', template_type: 'canva' }],
      })
    )
  );
}

function Where() {
  const location = useLocation();
  return <output aria-label="Adresse">{location.search}</output>;
}

function renderGallery(route = '/vorlagen') {
  return renderWithProviders(
    <Routes>
      <Route
        path="/vorlagen"
        element={
          <>
            <VorlagenGallery />
            <Where />
          </>
        }
      />
    </Routes>,
    { route }
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: API, authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1' } as never });
  localStorage.clear();
});

describe('VorlagenGallery', () => {
  it('has one left page heading with the icon toolbar', async () => {
    serve();
    const { container } = renderGallery();

    expect((await screen.findAllByText('Plakat Klima')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Vorlagen-Datenbank');
    expect(screen.queryByText(/Sharepics zum Kopieren/)).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einstellungen' })).not.toBeInTheDocument();

    for (const name of [
      'Suchen',
      'Vorlage hinzufügen',
      'Nur gemerkte Vorlagen',
      'Filter',
      'Große Kacheln',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(await axe(container)).toHaveNoViolations();
  });

  it('picks a category from the filter menu and keeps it in the address', async () => {
    serve();
    const { user } = renderGallery();

    const plain = await screen.findByRole('button', { name: 'Filter' });
    expect(plain).not.toHaveClass('text-primary-600');
    expect(plain.querySelector('span')).toBeNull();

    await user.click(plain);
    const menu = await screen.findByRole('menu');
    const options = within(menu).getAllByRole('menuitemradio');
    expect(options.map((o) => o.textContent)).toEqual([
      'Alle Vorlagen',
      'Grünerator',
      'Canva',
      'Meine Vorlagen',
    ]);
    expect(within(menu).getByRole('menuitemradio', { name: 'Alle Vorlagen' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Canva' }));

    expect(screen.getByLabelText('Adresse')).toHaveTextContent('?cat=canva');
    const active = screen.getByRole('button', { name: 'Filter: Canva' });
    expect(active).toHaveClass('text-primary-600');
    expect(active.querySelector('span')).not.toBeNull();
    await waitFor(() =>
      expect(galleryQueries.some((q) => q.get('templateType') === 'canva')).toBe(true)
    );

    await user.click(screen.getByRole('button', { name: 'Filter „Canva“ entfernen' }));
    expect(screen.getByLabelText('Adresse')).toBeEmptyDOMElement();
    const reset = screen.getByRole('button', { name: 'Filter' });
    expect(reset).not.toHaveClass('text-primary-600');
    expect(reset.querySelector('span')).toBeNull();
  });

  it('toggles the bookmark filter from the toolbar', async () => {
    serve({ favoriteIds: ['g2'] });
    const { user } = renderGallery();
    expect((await screen.findAllByText('Plakat Klima')).length).toBeGreaterThan(0);

    const toggle = screen.getByRole('button', { name: 'Nur gemerkte Vorlagen' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(screen.queryByText('Plakat Klima')).not.toBeInTheDocument());
    expect(screen.getAllByText('Flyer Radweg').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Gemerkt/ })).not.toBeInTheDocument();
  });

  it('shows the own Vorlagen under the Meine-Vorlagen filter', async () => {
    serve();
    const { container } = renderGallery('/vorlagen?cat=meine');

    expect((await screen.findAllByText('Mein Canva-Plakat')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Filter: Meine Vorlagen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vorlage hinzufügen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suchen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Große Kacheln' })).not.toBeInTheDocument();
    expect(galleryQueries).toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('never asks for other countries', async () => {
    serve();
    renderGallery();
    await waitFor(() => expect(galleryQueries.length).toBeGreaterThan(0));
    expect(galleryQueries.every((q) => !q.has('localeFilter'))).toBe(true);
    await waitFor(() => expect(catalogQueries).toEqual(['']));
  });

  it('lists catalogue and gallery Vorlagen in one grid without an empty state', async () => {
    serve({ gallery: [], catalog: [catalogVorlage('k1', 'Zitat auf Grün')] });
    renderGallery();

    expect(await screen.findByRole('button', { name: 'Zitat auf Grün' })).toBeInTheDocument();
    expect(await screen.findByText('1 Vorlage')).toBeInTheDocument();
    expect(screen.queryByText(/Keine Vorlagen|Noch keine/)).not.toBeInTheDocument();
  });

  it('says to try another term when a search finds nothing', async () => {
    serve({ gallery: [] });
    const { user } = renderGallery();

    await user.click(await screen.findByRole('button', { name: 'Suchen' }));
    await user.type(screen.getByRole('searchbox', { name: 'Vorlagen durchsuchen…' }), 'Mond');

    expect(await screen.findByText('Keine Vorlagen gefunden')).toBeInTheDocument();
    expect(screen.getByText('Versuche einen anderen Suchbegriff.')).toBeInTheDocument();
  });

  it('explains how to bookmark when nothing is bookmarked', async () => {
    serve();
    const { user } = renderGallery();
    expect((await screen.findAllByText('Plakat Klima')).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Nur gemerkte Vorlagen' }));

    expect(await screen.findByText('Noch keine gemerkten Vorlagen')).toBeInTheDocument();
    expect(screen.getByText(/auf das Lesezeichen/)).toBeInTheDocument();
    expect(screen.queryByText('Versuche einen anderen Suchbegriff.')).not.toBeInTheDocument();
  });

  it('offers the way back to all Vorlagen when a category is empty', async () => {
    serve({ gallery: [] });
    const { user } = renderGallery('/vorlagen?cat=canva');

    expect(
      await screen.findByText('In dieser Kategorie gibt es noch keine Vorlagen')
    ).toBeInTheDocument();
    expect(screen.queryByText('Versuche einen anderen Suchbegriff.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Alle Vorlagen anzeigen' }));
    expect(screen.getByLabelText('Adresse')).toBeEmptyDOMElement();
  });

  it('shows a plain empty state without any search or filter', async () => {
    serve({ gallery: [] });
    renderGallery();

    expect(await screen.findByText('Noch keine Vorlagen')).toBeInTheDocument();
    expect(screen.queryByText('Versuche einen anderen Suchbegriff.')).not.toBeInTheDocument();
  });

  it('switches between small and large cards and remembers the choice', async () => {
    serve();
    const { user, unmount } = renderGallery();

    const toggle = await screen.findByRole('button', { name: 'Große Kacheln' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('vorlagen-grid-size')).toBe('large');

    unmount();
    renderGallery();
    expect(await screen.findByRole('button', { name: 'Große Kacheln' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('adds Vorlagen only through the toolbar plus, not a grid tile', async () => {
    serve();
    const { user } = renderGallery();
    expect((await screen.findAllByText('Plakat Klima')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Neue Vorlage' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Vorlage hinzufügen' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});

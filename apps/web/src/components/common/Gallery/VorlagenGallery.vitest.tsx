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

let galleryQueries: URLSearchParams[] = [];

function serve({ favoriteIds = [] as string[] } = {}) {
  galleryQueries = [];
  server.use(
    http.get('*/api/auth/vorlagen', ({ request }) => {
      galleryQueries.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        vorlagen: [galleryItem('g1', 'Plakat Klima'), galleryItem('g2', 'Flyer Radweg')],
      });
    }),
    http.get('*/api/auth/vorlagen-categories', () =>
      HttpResponse.json({ categories: [{ id: 'canva', label: 'Canva' }] })
    ),
    http.get(`${API}/sharepic-vorlagen`, () => HttpResponse.json({ vorlagen: [] })),
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

    for (const name of [
      'Suchen',
      'Vorlage hinzufügen',
      'Nur gemerkte Vorlagen',
      'Filter',
      'Einstellungen',
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

  it('keeps only the region switch in the settings menu', async () => {
    serve();
    const { user } = renderGallery();

    await user.click(await screen.findByRole('button', { name: 'Einstellungen' }));
    const menu = await screen.findByRole('menu');

    expect(within(menu).getAllByRole('menuitemcheckbox')).toHaveLength(1);
    expect(
      within(menu).getByRole('menuitemcheckbox', { name: /Auf Deutschland beschränken/ })
    ).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitemradio')).not.toBeInTheDocument();
  });

  it('shows the own Vorlagen under the Meine-Vorlagen filter', async () => {
    serve();
    const { container } = renderGallery('/vorlagen?cat=meine');

    expect((await screen.findAllByText('Mein Canva-Plakat')).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Filter: Meine Vorlagen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vorlage hinzufügen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suchen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Einstellungen' })).not.toBeInTheDocument();
    expect(galleryQueries).toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();
  });
});

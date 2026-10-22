import { composePrint } from '@gruenerator/canvas-editor/composer';
import { PRINT_UNGETESTET_HINWEIS, type SharepicVorlage } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { item } from '../../../test/marketplaceFixtures';
import { server } from '../../../test/msw-server';
import { PRINT_VORLAGEN_FIXTURE } from '../../../test/printVorlagenFixture';

import VorlagenGallery from './VorlagenGallery';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders } from '@/test-utils';

const API = 'http://localhost/api';

// Opening a canvas warms the editor chunk, which would load after the test ends.
vi.mock('../../../features/image-studio/routeChunks', () => ({
  loadCanvasStudioPage: () => Promise.resolve(),
}));

/** jsdom has no canvas to measure text and no brand fonts to wait for. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
vi.mock('@gruenerator/canvas-editor/composer', async (importOriginal) => {
  const actual = await importOriginal<{ composePrint: typeof composePrint }>();
  return {
    ...actual,
    ensureFontsReady: async () => {},
    composePrint: (spec: Parameters<typeof composePrint>[0]) =>
      actual.composePrint(spec, { measure }),
  };
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

let marketplaceQueries: URLSearchParams[] = [];
let catalogQueries: string[] = [];

/** Public Vorlagen live in the Marktplatz; `/vorlagen` only asks it for the bookmarked ones. */
const PUBLIC = [item('template', 'Flyer Radweg', { ref: 'g2' })];

function serve({
  favoriteIds = [] as string[],
  catalog = [catalogVorlage('k1', 'Plakat Klima')] as SharepicVorlage[],
} = {}) {
  marketplaceQueries = [];
  catalogQueries = [];
  server.use(
    http.get(`${API}/marketplace`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      marketplaceQueries.push(params);
      const items =
        params.get('scope') === 'saved'
          ? PUBLIC.filter((i) => favoriteIds.includes(i.ref)).map((i) => ({ ...i, saved: true }))
          : PUBLIC;
      return HttpResponse.json({ sections: [{ kind: 'template', items, hasMore: false }] });
    }),
    // Like the server: the viewer's country, the other one via `land`.
    http.get(`${API}/sharepic-vorlagen/print`, ({ request }) => {
      const land = new URL(request.url).searchParams.get('land') ?? useAuthStore.getState().locale;
      return HttpResponse.json({
        vorlagen: PRINT_VORLAGEN_FIXTURE.filter((v) => v.locale === land),
      });
    }),
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
        items: ids.map((id) => ({ id, likes_count: 0 })),
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
      <Route path="/studio/canvas/:id" element={<p>Editor geöffnet</p>} />
    </Routes>,
    { route }
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: API, authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1' } as never, locale: 'de-DE' });
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
      'Öffentliche Vorlagen',
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
    // Community categories (Canva …) are gone: public Vorlagen live in the Marktplatz.
    expect(options.map((o) => o.textContent)).toEqual([
      'Alle Vorlagen',
      'Grünerator',
      'Print',
      'Meine Vorlagen',
    ]);
    expect(within(menu).getByRole('menuitemradio', { name: 'Alle Vorlagen' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    await user.click(within(menu).getByRole('menuitemradio', { name: 'Print' }));

    expect(screen.getByLabelText('Adresse')).toHaveTextContent('?cat=print');
    const active = screen.getByRole('button', { name: 'Filter: Print' });
    expect(active).toHaveClass('text-primary-600');
    expect(active.querySelector('span')).not.toBeNull();

    await user.click(screen.getByRole('button', { name: 'Filter „Print“ entfernen' }));
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
    // The bookmarked public Vorlage comes from the Marktplatz.
    expect((await screen.findAllByText('Flyer Radweg')).length).toBeGreaterThan(0);
    expect(Object.fromEntries(marketplaceQueries.at(-1)!)).toMatchObject({
      kinds: 'template',
      scope: 'saved',
    });
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
    expect(marketplaceQueries).toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('never asks for other countries', async () => {
    serve();
    renderGallery();
    await waitFor(() => expect(catalogQueries).toEqual(['']));
  });

  it('asks the Marktplatz only for bookmarks, and opens the public Vorlagen there', async () => {
    serve();
    const { user } = renderGallery();
    expect((await screen.findAllByText('Plakat Klima')).length).toBeGreaterThan(0);
    expect(marketplaceQueries).toHaveLength(0);
    expect(screen.queryByText('Flyer Radweg')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Öffentliche Vorlagen' }));

    const dialog = await screen.findByRole('dialog', { name: 'Öffentliche Vorlagen' });
    expect(
      await within(dialog).findByRole('heading', { name: 'Flyer Radweg' })
    ).toBeInTheDocument();
    expect(Object.fromEntries(marketplaceQueries.at(-1)!)).toMatchObject({
      kinds: 'template',
      scope: 'shop',
    });
  });

  it('lists catalogue and gallery Vorlagen in one grid without an empty state', async () => {
    serve({ catalog: [catalogVorlage('k1', 'Zitat auf Grün')] });
    renderGallery();

    expect(await screen.findByRole('button', { name: 'Zitat auf Grün' })).toBeInTheDocument();
    // „Alle" shows the three print Vorlagen of the country too.
    expect(await screen.findByText('4 Vorlagen')).toBeInTheDocument();
    expect(screen.queryByText(/Keine Vorlagen|Noch keine/)).not.toBeInTheDocument();
  });

  it('says to try another term when a search finds nothing', async () => {
    serve();
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
    serve({ catalog: [] });
    const { user } = renderGallery('/vorlagen?cat=gruenerator');

    expect(
      await screen.findByText('In dieser Kategorie gibt es noch keine Vorlagen')
    ).toBeInTheDocument();
    expect(screen.queryByText('Versuche einen anderen Suchbegriff.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Alle Vorlagen anzeigen' }));
    expect(screen.getByLabelText('Adresse')).toBeEmptyDOMElement();
  });

  it('is never empty without a search or filter: the print Vorlagen are always there', async () => {
    serve({ catalog: [] });
    renderGallery();

    expect(await screen.findByText('3 Vorlagen')).toBeInTheDocument();
    expect(screen.queryByText(/Keine Vorlagen|Noch keine/)).not.toBeInTheDocument();
  });

  describe('Print', () => {
    const printThumbs = () =>
      screen
        .getAllByRole('img')
        .map((img) => img.getAttribute('src') ?? '')
        .filter((src) => src.startsWith('/api/sharepic-vorlagen/print/'));

    it.each([
      ['de-DE', ['de-visitenkarte-quer', 'de-visitenkarte-hoch', 'de-plakat-typo-a3']],
      ['de-AT', ['at-visitenkarte-quer', 'at-visitenkarte-hoch', 'at-plakat-typo-a3']],
    ] as const)('shows the three print Vorlagen of %s under „Print"', async (locale, ids) => {
      useAuthStore.setState({ locale });
      serve({ catalog: [catalogVorlage('k1', 'Zitat auf Grün')] });
      renderGallery('/vorlagen?cat=print');

      expect(await screen.findByText('3 Vorlagen')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Filter: Print' })).toBeInTheDocument();
      expect(printThumbs()).toEqual(
        ids.map((id) => `/api/sharepic-vorlagen/print/${id}/thumb?v=v1`)
      );
      expect(screen.getAllByText('Print · 85 × 55 mm')).toHaveLength(1);
      expect(screen.getByText('Print · 297 × 420 mm')).toBeInTheDocument();
      // Neither the catalogue nor community Vorlagen come along.
      expect(screen.queryByText('Zitat auf Grün')).not.toBeInTheDocument();
      expect(screen.queryByText('Plakat Klima')).not.toBeInTheDocument();
    });

    it('shows a print Vorlage in a dialog first, then opens it as a canvas in its print format', async () => {
      serve();
      const bodies: Record<string, unknown>[] = [];
      server.use(
        http.post('*/api/canvas', async ({ request }) => {
          bodies.push((await request.json()) as Record<string, unknown>);
          return HttpResponse.json(
            {
              id: 'c-print',
              title: 'Visitenkarte quer',
              created_by: 'u1',
              created_at: '2026-10-16T00:00:00Z',
              updated_at: '2026-10-16T00:00:00Z',
              permissions: null,
              is_public: false,
              template_type: 'freeform',
              base_template_id: null,
              thumbnail_url: null,
              page_count: 2,
              initial_state: {},
              format: 'print-visitenkarte-quer',
            },
            { status: 201 }
          );
        })
      );
      const { user } = renderGallery('/vorlagen?cat=print');

      await user.click(await screen.findByRole('button', { name: 'Visitenkarte quer' }));
      const dialog = await screen.findByRole('dialog', { name: 'Visitenkarte quer' });
      expect(bodies).toEqual([]);
      expect(
        within(dialog).getByRole('button', { name: 'Seite 2 von 2 anzeigen' })
      ).toBeInTheDocument();
      expect(within(dialog).queryByRole('button', { name: 'Liken' })).not.toBeInTheDocument();
      expect(within(dialog).getByRole('note')).toHaveTextContent(PRINT_UNGETESTET_HINWEIS);
      await user.click(within(dialog).getByRole('button', { name: 'Bearbeiten' }));

      expect(await screen.findByText('Editor geöffnet')).toBeInTheDocument();
      const vorlage = PRINT_VORLAGEN_FIXTURE.find((v) => v.id === 'de-visitenkarte-quer')!;
      const composed = composePrint(vorlage.spec);
      const pages = composed.slides.map((state, i) => ({
        id: `seed-${i}`,
        configId: 'freeform',
        state,
      }));
      expect(bodies).toEqual([
        {
          title: 'Visitenkarte quer',
          template_type: 'freeform',
          format: 'print-visitenkarte-quer',
          page_count: 2,
          initial_state: { ...composed.slides[0], pages },
        },
      ]);
    });
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

  describe('country switch', () => {
    it('is not there for non-admins, and a `land` in the link changes nothing', async () => {
      serve();
      renderGallery('/vorlagen?land=de-AT');
      expect((await screen.findAllByText('Plakat Klima')).length).toBeGreaterThan(0);

      expect(screen.queryByRole('button', { name: /^Land/ })).not.toBeInTheDocument();
      await waitFor(() => expect(catalogQueries).toEqual(['']));
    });

    it('lets an instance admin switch to the other country and back', async () => {
      useAuthStore.setState({ user: { id: 'u1', is_admin: true } as never, locale: 'de-DE' });
      serve();
      const { user, container } = renderGallery();

      const own = await screen.findByRole('button', { name: 'Land: Deutschland' });
      expect(own).not.toHaveClass('text-primary-600');
      expect(own.querySelector('span')).toBeNull();
      expect(await axe(container)).toHaveNoViolations();

      await user.click(own);
      const menu = await screen.findByRole('menu');
      expect(
        within(menu)
          .getAllByRole('menuitemradio')
          .map((o) => o.textContent)
      ).toEqual(['Deutschland (eigenes Land)', 'Österreich']);
      expect(await axe(menu)).toHaveNoViolations();
      await user.click(within(menu).getByRole('menuitemradio', { name: 'Österreich' }));

      expect(screen.getByLabelText('Adresse')).toHaveTextContent('?land=de-AT');
      const active = screen.getByRole('button', { name: 'Land: Österreich' });
      expect(active).toHaveClass('text-primary-600');
      expect(active.querySelector('span')).not.toBeNull();
      await waitFor(() => expect(catalogQueries).toContain('?land=de-AT'));

      await user.click(active);
      await user.click(
        within(await screen.findByRole('menu')).getByRole('menuitemradio', {
          name: 'Deutschland (eigenes Land)',
        })
      );
      expect(screen.getByLabelText('Adresse')).toBeEmptyDOMElement();
      expect(screen.getByRole('button', { name: 'Land: Deutschland' })).toBeInTheDocument();
    });

    it('opens an admin link in the other country right away', async () => {
      useAuthStore.setState({ user: { id: 'u1', is_admin: true } as never, locale: 'de-DE' });
      serve();
      renderGallery('/vorlagen?land=de-AT');

      expect(await screen.findByRole('button', { name: 'Land: Österreich' })).toBeInTheDocument();
      await waitFor(() => expect(catalogQueries).toEqual(['?land=de-AT']));
    });
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

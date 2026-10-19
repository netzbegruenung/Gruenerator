/**
 * „Element hinzufügen": Art → eigenes Element → Sichtbarkeit. Geteilt wird nur,
 * was es schon gibt; die drei Optionen stehen bei jeder Art da, was eine Art
 * nicht kann, bleibt sichtbar und nennt den Grund.
 */
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { MarketplaceAddDialog } from './MarketplaceAddDialog';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders, screen, waitFor, within } from '@/test-utils';

const API = 'http://localhost/api';

let calls: { method: string; path: string; body: unknown }[] = [];

function record(method: string) {
  return async ({ request }: { request: Request }) => {
    const text = await request.text();
    calls.push({
      method,
      path: new URL(request.url).pathname,
      body: text ? (JSON.parse(text) as unknown) : null,
    });
    return HttpResponse.json({ success: true, message: 'ok' });
  };
}

const ASSET = {
  id: 'asset-1',
  kind: 'sticker',
  title: 'Sonnenblume',
  tags: [],
  src: '/s.png',
  thumbUrl: null,
  width: 10,
  height: 10,
  source: 'upload',
  visibility: 'private',
  audience: 'de-DE',
  moderation: 'ok',
  isOwn: true,
  authorName: null,
  likesCount: 0,
  liked: false,
  favorited: false,
  createdAt: '2026-10-01T00:00:00.000Z',
};

const recipe = (over: Record<string, unknown> = {}) => ({
  id: 'recipe-1',
  kind: 'custom',
  textType: null,
  mention: 'pressemitteilung',
  title: 'Pressemitteilung',
  examples: [],
  styleBlock: '',
  model: null,
  analyzedAt: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
  sharedWithGroups: [],
  sharedFromGroup: null,
  ownerName: null,
  description: 'Kurz und knapp',
  iconKey: null,
  shareMode: 'private',
  isPublic: false,
  publicOwnership: null,
  ...over,
});

function Where() {
  return <output aria-label="Adresse">{useLocation().search}</output>;
}

const renderDialog = () =>
  renderWithProviders(
    <Routes>
      <Route
        path="/marktplatz"
        element={
          <>
            <MarketplaceAddDialog open onOpenChange={() => {}} />
            <Where />
          </>
        }
      />
    </Routes>,
    { route: '/marktplatz' }
  );

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: `${API}`, authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1' } as never, locale: 'de-DE' });
  calls = [];
  server.use(
    http.get(`${API}/auth/groups/me`, () =>
      HttpResponse.json([{ id: 'g1', name: 'KV Musterstadt', role: 'member' }])
    ),
    http.get(`${API}/user-agents`, () =>
      HttpResponse.json({
        agents: [{ id: 'agent-1', identifier: 'presse-ab12', title: 'Presse', description: '' }],
      })
    ),
    http.get(`${API}/user-agents/public`, () => HttpResponse.json({ agents: [] })),
    http.get(`${API}/user-agents/:identifier/share`, () =>
      HttpResponse.json({
        share_mode: 'private',
        audience: 'de-DE',
        is_public: false,
        public_ownership: null,
      })
    ),
    http.get(`${API}/user-agents/:identifier/groups`, () => HttpResponse.json([])),
    http.put(`${API}/user-agents/:identifier/share/mode`, record('PUT')),
    http.put(`${API}/user-agents/:identifier/share/is-public`, record('PUT')),
    http.get(`${API}/text-forms`, () =>
      HttpResponse.json({
        forms: [
          recipe({ shareMode: 'authenticated', isPublic: true, publicOwnership: 'owner' }),
          recipe({ id: 'preset-1', kind: 'preset', mention: 'brief', title: 'Angepasst' }),
          recipe({ id: 'other', mention: 'fremd', title: 'Fremd', sharedFromGroup: 'KV' }),
        ],
      })
    ),
    http.put(`${API}/text-forms/:mention/share/mode`, record('PUT')),
    http.put(`${API}/text-forms/:mention/share/is-public`, record('PUT')),
    http.put(`${API}/text-forms/:mention/share`, record('PUT')),
    http.get(`${API}/auth/user-templates`, () =>
      HttpResponse.json({
        success: true,
        data: [
          { id: 't1', title: 'Plakat', description: null, status: 'draft', is_private: true },
          {
            id: 't2',
            title: 'Flyer',
            description: null,
            status: 'pending_review',
            is_private: false,
          },
        ],
      })
    ),
    http.put(`${API}/auth/user-templates/:id`, record('PUT')),
    http.get(`${API}/studio-assets`, ({ request }) => {
      const kind = new URL(request.url).searchParams.get('kind');
      return HttpResponse.json({ items: kind === 'sticker' ? [ASSET] : [], hasMore: false });
    }),
    http.patch(`${API}/studio-assets/:id`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      calls.push({ method: 'PATCH', path: new URL(request.url).pathname, body });
      return HttpResponse.json({ ...ASSET, ...body });
    })
  );
});

const dialog = () => screen.getByRole('dialog', { name: 'Element hinzufügen' });

describe('MarketplaceAddDialog', () => {
  it('starts with the kinds one can share, and no way to create something new', async () => {
    const { container } = renderDialog();
    const kinds = within(screen.getByRole('list', { name: 'Arten' })).getAllByRole('button');
    expect(kinds.map((k) => k.querySelector('.font-medium')?.textContent)).toEqual([
      'Agent',
      'Rezept',
      'Vorlage',
      'Sticker',
      'Hintergrund',
    ]);
    expect(within(dialog()).getByRole('listitem', { current: 'step' })).toHaveTextContent('1. Art');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('lists an Agent in the Marktplatz: mode first, then the listing, then opens it there', async () => {
    const { user, container } = renderDialog();
    await user.click(within(dialog()).getByRole('button', { name: /Agent/ }));
    await user.click(await screen.findByRole('button', { name: /Presse/ }));

    expect(await screen.findByRole('radio', { name: /Privat/ })).toBeChecked();
    const done = screen.getByRole('button', { name: 'Fertig' });
    expect(done).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: /Öffentlich im Marktplatz/ }));
    expect(done).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
    await user.click(screen.getByRole('radio', { name: /Ich besitze die Inhalte/ }));
    await user.click(done);

    await waitFor(() =>
      expect(screen.getByRole('status', { name: 'Adresse', hidden: true })).toHaveTextContent(
        'item=agent%3Aagent-1'
      )
    );
    expect(calls).toEqual([
      {
        method: 'PUT',
        path: '/api/user-agents/presse-ab12/share/mode',
        body: { mode: 'authenticated' },
      },
      {
        method: 'PUT',
        path: '/api/user-agents/presse-ab12/share/is-public',
        body: { is_public: true, public_ownership: 'owner' },
      },
    ]);
  });

  it('marks an Agent shared into a project as „Projekt" in the list', async () => {
    server.use(
      http.get(`${API}/user-agents`, () =>
        HttpResponse.json({
          agents: [
            {
              id: 'agent-1',
              identifier: 'presse-ab12',
              title: 'Presse',
              description: '',
              shareMode: 'groups',
            },
          ],
        })
      )
    );
    const { user } = renderDialog();
    await user.click(within(dialog()).getByRole('button', { name: /Agent/ }));
    const row = await screen.findByRole('button', { name: /Presse/ });
    expect(row).toHaveTextContent('Projekt');
  });

  it('offers only one’s own recipes, and moves a public one into a project', async () => {
    const { user } = renderDialog();
    await user.click(within(dialog()).getByRole('button', { name: /Rezept/ }));

    const own = await screen.findByRole('button', { name: /Pressemitteilung/ });
    expect(own).toHaveTextContent('Öffentlich');
    expect(screen.queryByRole('button', { name: /Angepasst/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fremd/ })).not.toBeInTheDocument();

    await user.click(own);
    expect(screen.getByRole('radio', { name: /Öffentlich im Marktplatz/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Projekt/ }));
    await user.click(await screen.findByRole('checkbox', { name: 'KV Musterstadt' }));
    await user.click(screen.getByRole('button', { name: 'Fertig' }));

    await waitFor(() => expect(calls).toHaveLength(3));
    expect(calls.map((c) => [c.path, c.body])).toEqual([
      [
        '/api/text-forms/pressemitteilung/share/is-public',
        { is_public: false, public_ownership: null },
      ],
      ['/api/text-forms/pressemitteilung/share', { group_id: 'g1' }],
      ['/api/text-forms/pressemitteilung/share/mode', { mode: 'groups' }],
    ]);
  });

  it('keeps „Projekt" visible but disabled for a sticker, and asks for the rights before it goes public', async () => {
    const { user } = renderDialog();
    await user.click(within(dialog()).getByRole('button', { name: /Sticker/ }));
    await user.click(await screen.findByRole('button', { name: /Sonnenblume/ }));

    const project = screen.getByRole('radio', { name: /Projekt/ });
    expect(project).toBeDisabled();
    expect(project).toHaveAccessibleDescription(
      'Sticker und Hintergründe lassen sich noch nicht in Projekte teilen.'
    );

    await user.click(screen.getByRole('radio', { name: /Öffentlich im Marktplatz/ }));
    const done = screen.getByRole('button', { name: 'Fertig' });
    expect(done).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'Alle' }));
    await user.click(screen.getByRole('checkbox', { name: /Rechte an diesem Bild/ }));
    await user.click(done);

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: 'PATCH',
      path: '/api/studio-assets/asset-1',
      body: { visibility: 'public', rightsConfirmed: true, audience: 'all' },
    });
  });

  it('submits a Vorlage for review instead of publishing it, and shows which ones wait', async () => {
    const { user } = renderDialog();
    await user.click(within(dialog()).getByRole('button', { name: /Vorlage/ }));
    expect(await screen.findByRole('button', { name: /Flyer/ })).toHaveTextContent('In Prüfung');

    await user.click(screen.getByRole('button', { name: /Plakat/ }));
    expect(screen.getByRole('radio', { name: /Projekt/ })).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /Öffentlich im Marktplatz/ }));
    expect(screen.getByText(/sobald das Grünerator-Team sie geprüft hat/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fertig' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toEqual({
      method: 'PUT',
      path: '/api/auth/user-templates/t1',
      body: { is_private: false, status: 'pending_review' },
    });
    expect(screen.getByRole('status', { name: 'Adresse', hidden: true })).toHaveTextContent('');
  });

  it('points to where a kind is made when one has none yet', async () => {
    const { user } = renderDialog();
    await user.click(within(dialog()).getByRole('button', { name: /Hintergrund/ }));
    expect(await screen.findByText('Du hast noch keine Hintergründe.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zu Sticker & Hintergründe' })).toHaveAttribute(
      'href',
      '/studio/sticker'
    );
    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(within(dialog()).getByRole('listitem', { current: 'step' })).toHaveTextContent('1. Art');
  });
});

import { type PopularVorlage, type SharepicVorlage } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { PopularVorlagenRow } from './PopularVorlagenRow';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders } from '@/test-utils';

const API = 'http://localhost/api/auth';

const vorlage = (id: string): SharepicVorlage => ({
  id,
  locale: 'de-DE',
  titel: `Zitat ${id}`,
  beschreibung: 'Ein Zitat auf Grün.',
  form: 'zitat',
  herkunft: 'alt-template',
  chat: { prompts: ['Erstelle ein Zitat-Sharepic mit dem Satz „Bus statt Stau“'] },
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

const POPULAR: PopularVorlage[] = [
  { kind: 'catalog', vorlage: vorlage('k1'), likes_count: 4 },
  { kind: 'catalog', vorlage: vorlage('k2'), likes_count: 0 },
  { kind: 'catalog', vorlage: vorlage('k3'), likes_count: 0 },
];

let requests: string[];

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  requests = [];
  useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1' } as never });
  server.use(
    http.get(`${API}/templates/popular`, ({ request }) => {
      requests.push(`popular${new URL(request.url).search}`);
      return HttpResponse.json({ success: true, items: POPULAR });
    }),
    http.get(`${API}/templates/engagement`, ({ request }) => {
      const ids = new URL(request.url).searchParams.get('ids')!.split(',');
      return HttpResponse.json({
        success: true,
        items: ids.map((id) => ({ id, likes_count: id === 'k1' ? 4 : 0 })),
      });
    }),
    http.get(`${API}/templates/likes`, () => HttpResponse.json({ success: true, liked_ids: [] })),
    http.get(`${API}/templates/favorites`, () =>
      HttpResponse.json({ success: true, favorite_ids: [], templates: [] })
    ),
    http.post(`${API}/templates/:id/like`, ({ params }) => {
      requests.push(`like ${params.id}`);
      return HttpResponse.json({ success: true, liked: true, count: 5 });
    }),
    http.delete(`${API}/templates/:id/like`, ({ params }) => {
      requests.push(`unlike ${params.id}`);
      return HttpResponse.json({ success: true, liked: false, count: 4 });
    }),
    http.delete(`${API}/templates/:id/favorite`, ({ params }) => {
      requests.push(`unfavorite ${params.id}`);
      return HttpResponse.json({ success: true, favorited: false });
    }),
    http.post(`${API}/templates/:id/favorite`, ({ params }) => {
      requests.push(`favorite ${params.id}`);
      return HttpResponse.json({ success: true, favorited: true });
    })
  );
});

afterEach(() => {
  useAuthStore.setState({ isAuthenticated: false, user: null });
});

describe('PopularVorlagenRow', () => {
  it('shows one row, two cards on phones, with a link to all Vorlagen', async () => {
    renderWithProviders(<PopularVorlagenRow />);
    const section = await screen.findByRole('region', { name: 'Beliebte Vorlagen' });

    const cards = ['Zitat k1', 'Zitat k2', 'Zitat k3'].map((name) =>
      within(section).getByRole('button', { name })
    );
    expect(cards[0]!.closest('.max-sm\\:hidden')).toBeNull();
    expect(cards[1]!.closest('.max-sm\\:hidden')).toBeNull();
    expect(cards[2]!.closest('.max-sm\\:hidden')).not.toBeNull();
    expect(within(section).getByRole('link', { name: 'Alle Vorlagen' })).toHaveAttribute(
      'href',
      '/vorlagen'
    );
    expect(requests).toContain('popular?limit=4');
  });

  it('offers like and bookmark but no reactions', async () => {
    renderWithProviders(<PopularVorlagenRow />);
    await screen.findByRole('button', { name: 'Zitat k1' });
    expect(screen.getAllByRole('button', { name: 'Gefällt mir' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Merken' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Reaktion/ })).not.toBeInTheDocument();
  });

  it('likes a Vorlage once, without flipping back', async () => {
    const { user } = renderWithProviders(<PopularVorlagenRow />);
    await screen.findByRole('button', { name: 'Zitat k1' });
    const [like] = screen.getAllByRole('button', { name: 'Gefällt mir' });

    await user.click(like!);
    await waitFor(() => expect(requests).toContain(`like k1`));
    expect(requests).not.toContain(`unlike k1`);
  });

  it('bookmarks a Vorlage', async () => {
    const { user } = renderWithProviders(<PopularVorlagenRow />);
    await screen.findByRole('button', { name: 'Zitat k1' });
    const [merken] = screen.getAllByRole('button', { name: 'Merken' });

    await user.click(merken!);
    await waitFor(() => expect(requests).toContain(`favorite k1`));
    expect(requests).not.toContain(`unfavorite k1`);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<PopularVorlagenRow />);
    await screen.findByRole('button', { name: 'Zitat k1' });
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders nothing when there are no Vorlagen', async () => {
    server.use(
      http.get(`${API}/templates/popular`, () => HttpResponse.json({ success: true, items: [] }))
    );
    const { container } = renderWithProviders(<PopularVorlagenRow />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

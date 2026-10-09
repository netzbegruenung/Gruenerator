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
const UUID = '11111111-2222-4333-8444-555555555555';

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
  {
    kind: 'user',
    template: { id: UUID, title: 'Canva-Plakat', template_type: 'canva' },
    likes_count: 4,
    reactions: [],
  },
  { kind: 'catalog', vorlage: vorlage('k1'), likes_count: 0, reactions: [] },
  { kind: 'catalog', vorlage: vorlage('k2'), likes_count: 0, reactions: [] },
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
        items: ids.map((id) => ({
          id,
          likes_count: id === UUID ? 4 : 0,
          reactions: id === 'k1' ? [{ emoji: '🎉', count: 2, reacted: false }] : [],
        })),
      });
    }),
    http.get(`${API}/templates/likes`, () => HttpResponse.json({ success: true, liked_ids: [] })),
    http.get(`${API}/templates/favorites`, () =>
      HttpResponse.json({ success: true, favorite_ids: [], templates: [] })
    ),
    http.put(`${API}/reactions/:type/:id/:emoji`, ({ params }) => {
      requests.push(`react ${params.type} ${params.id} ${params.emoji}`);
      return HttpResponse.json({ reactions: [{ emoji: '🎉', count: 3, reacted: true }] });
    }),
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
  it('shows one mixed row, two cards on phones, with a link to all Vorlagen', async () => {
    renderWithProviders(<PopularVorlagenRow />);
    const section = await screen.findByRole('region', { name: 'Beliebte Vorlagen' });

    const cards = ['Canva-Plakat', 'Zitat k1', 'Zitat k2'].map((name) =>
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

  it('reacts on a catalogue Vorlage by its string id, optimistically', async () => {
    const { user } = renderWithProviders(<PopularVorlagenRow />);
    const chip = await screen.findByRole('button', { name: '🎉 – 2 Reaktionen' });

    await user.click(chip);
    expect(
      await screen.findByRole('button', { name: '🎉 – 3 Reaktionen, darunter deine' })
    ).toHaveAttribute('aria-pressed', 'true');
    expect(requests).toContain('react template k1 🎉');
  });

  it('likes a Vorlage once, without flipping back', async () => {
    const { user } = renderWithProviders(<PopularVorlagenRow />);
    await screen.findByRole('button', { name: 'Canva-Plakat' });
    const [like] = screen.getAllByRole('button', { name: 'Gefällt mir' });

    await user.click(like!);
    await waitFor(() => expect(requests).toContain(`like ${UUID}`));
    expect(requests).not.toContain(`unlike ${UUID}`);
  });

  it('bookmarks a Vorlage', async () => {
    const { user } = renderWithProviders(<PopularVorlagenRow />);
    await screen.findByRole('button', { name: 'Canva-Plakat' });
    const [merken] = screen.getAllByRole('button', { name: 'Merken' });

    await user.click(merken!);
    await waitFor(() => expect(requests).toContain(`favorite ${UUID}`));
    expect(requests).not.toContain(`unfavorite ${UUID}`);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<PopularVorlagenRow />);
    await screen.findByRole('button', { name: '🎉 – 2 Reaktionen' });
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

import { type SharepicVorlage } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import FavoriteVorlagenSection from './FavoriteVorlagenSection';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders } from '@/test-utils';

const API = 'http://localhost/api';
const UUID = '11111111-2222-4333-8444-555555555555';

const vorlage = (id: string, titel: string): SharepicVorlage => ({
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

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: API, authMode: 'cookie' }));
});

function serve(favoriteIds: string[], templates: unknown[]) {
  server.use(
    http.get(`${API}/sharepic-vorlagen`, () =>
      HttpResponse.json({
        vorlagen: [vorlage('k1', 'Gemerktes Zitat'), vorlage('k2', 'Anderes Zitat')],
      })
    ),
    http.get(`${API}/auth/templates/favorites`, () =>
      HttpResponse.json({ success: true, favorite_ids: favoriteIds, templates })
    ),
    http.get(`${API}/auth/templates/likes`, () =>
      HttpResponse.json({ success: true, liked_ids: [] })
    ),
    http.get(`${API}/auth/templates/engagement`, ({ request }) => {
      const ids = new URL(request.url).searchParams.get('ids')!.split(',');
      return HttpResponse.json({
        success: true,
        items: ids.map((id) => ({ id, likes_count: 0 })),
      });
    })
  );
}

beforeEach(() => {
  useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1' } as never });
});

describe('FavoriteVorlagenSection', () => {
  it('lists bookmarked catalogue Vorlagen next to bookmarked templates', async () => {
    serve(['k1', UUID], [{ id: UUID, title: 'Canva-Plakat', template_type: 'canva' }]);
    const { container } = renderWithProviders(<FavoriteVorlagenSection />);

    expect((await screen.findAllByText('Gemerktes Zitat')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText('Canva-Plakat')).length).toBeGreaterThan(0);
    expect(screen.queryByText('Anderes Zitat')).not.toBeInTheDocument();
    expect(screen.getByText('Favoriten (2)')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('stays hidden without bookmarks', async () => {
    serve([], []);
    const { container } = renderWithProviders(<FavoriteVorlagenSection />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });
});

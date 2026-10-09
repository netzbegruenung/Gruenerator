import { type SharepicVorlage } from '@gruenerator/contracts';
import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import { SharepicVorlagenSection } from './SharepicVorlagenSection';

import { useAuthStore } from '@/stores/authStore';
import { axe, renderWithProviders } from '@/test-utils';

const LIST = 'http://localhost/api/sharepic-vorlagen';

const vorlage = (id: string, locale: SharepicVorlage['locale']): SharepicVorlage => ({
  id,
  locale,
  titel: `Zitat ${id}`,
  beschreibung: 'Ein Zitat auf Grün.',
  form: 'zitat',
  herkunft: 'alt-template',
  chat: { prompts: ['Erstelle ein Zitat-Sharepic mit dem Satz „Bus statt Stau“'] },
  attributions: [null],
  spec: {
    locale,
    slides: [
      {
        background: { kind: 'farbe', color: locale === 'de-AT' ? 'dunkelgruen' : 'tanne' },
        position: 'mitte',
        align: 'links',
        items: [{ type: 'headline', lines: ['Bus statt Stau'] }],
        logo: true,
      },
    ],
  },
});

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

function Where() {
  const location = useLocation();
  return <output aria-label="Ort">{location.pathname}</output>;
}

function renderSection() {
  return renderWithProviders(
    <Routes>
      <Route path="/vorlagen" element={<SharepicVorlagenSection query="" gridClassName="grid" />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    { route: '/vorlagen' }
  );
}

describe('SharepicVorlagenSection', () => {
  it('renders nothing while the catalogue is empty', async () => {
    let asked = false;
    server.use(
      http.get(LIST, () => {
        asked = true;
        return HttpResponse.json({ vorlagen: [] });
      })
    );
    const { container } = renderSection();
    await waitFor(() => expect(asked).toBe(true));
    expect(container).toBeEmptyDOMElement();
  });

  it('leaves the country to the server — no switch, no query', async () => {
    const queries: string[] = [];
    server.use(
      http.get(LIST, ({ request }) => {
        queries.push(new URL(request.url).search);
        return HttpResponse.json({ vorlagen: [vorlage('de-zitat', 'de-DE')] });
      })
    );
    renderSection();
    expect(await screen.findByRole('button', { name: 'Zitat de-zitat' })).toBeInTheDocument();
    expect(queries).toEqual(['']);
  });

  it('shows how to get one from the chat, and copies it on request', async () => {
    server.use(
      http.get(LIST, () => HttpResponse.json({ vorlagen: [vorlage('at-zitat', 'de-AT')] }))
    );
    const { user } = renderSection();
    await user.click(await screen.findByRole('button', { name: 'Zitat at-zitat' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('So erstellst du das im Chat')).toBeInTheDocument();
    expect(within(dialog).getByText(/Bus statt Stau/)).toBeInTheDocument();
    expect(within(dialog).getByRole('list', { name: 'Stichworte' })).toHaveTextContent('Zitat');
    expect(within(dialog).getByText(/Österreich/)).toBeInTheDocument();
    expect(await axe(dialog)).toHaveNoViolations();

    await user.click(within(dialog).getByRole('button', { name: /Kopie bearbeiten/ }));
    expect(await screen.findByLabelText('Ort')).toHaveTextContent('/studio/vorlage/at-zitat');
  });

  it('hands a prompt to the Sharepic-Creator', async () => {
    server.use(
      http.get(LIST, () => HttpResponse.json({ vorlagen: [vorlage('de-zitat', 'de-DE')] }))
    );
    const { user } = renderSection();
    await user.click(await screen.findByRole('button', { name: 'Zitat de-zitat' }));
    await user.click(await screen.findByRole('button', { name: /Bus statt Stau/ }));
    expect(await screen.findByLabelText('Ort')).toHaveTextContent('/studio/freitext');
  });

  it('shows every slide of a carousel, and says how many on the card', async () => {
    const karussell = vorlage('de-karussell', 'de-DE');
    karussell.spec.slides = [0, 1, 2].map(() => karussell.spec.slides[0]!);
    server.use(http.get(LIST, () => HttpResponse.json({ vorlagen: [karussell] })));
    const { user } = renderSection();

    const card = await screen.findByRole('button', { name: 'Zitat de-karussell' });
    expect(screen.getByText('3 Seiten')).toBeInTheDocument();

    await user.click(card);
    const pages = within(await screen.findByRole('dialog')).getByRole('list', { name: '3 Seiten' });
    const images = within(pages).getAllByRole('img');
    expect(images.map((img) => img.getAttribute('alt'))).toEqual([
      'Seite 1 von 3: Zitat de-karussell',
      'Seite 2 von 3: Zitat de-karussell',
      'Seite 3 von 3: Zitat de-karussell',
    ]);
    expect(images[2]).toHaveAttribute('src', '/api/sharepic-vorlagen/de-karussell/thumb?seite=3');
  });

  it('shows only the bookmarked Vorlagen when asked to', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: 'u1' } as never });
    const API = 'http://localhost/api/auth/templates';
    server.use(
      http.get(LIST, () =>
        HttpResponse.json({ vorlagen: [vorlage('de-a', 'de-DE'), vorlage('de-b', 'de-DE')] })
      ),
      http.get(`${API}/likes`, () => HttpResponse.json({ success: true, liked_ids: [] })),
      http.get(`${API}/favorites`, () =>
        HttpResponse.json({ success: true, favorite_ids: ['de-b'], templates: [] })
      ),
      http.get(`${API}/engagement`, () => HttpResponse.json({ success: true, items: [] }))
    );
    try {
      renderWithProviders(<SharepicVorlagenSection query="" gridClassName="grid" onlyFavorites />, {
        route: '/vorlagen',
      });
      const merken = await screen.findByRole('button', { name: 'Merken' });
      expect(merken).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Zitat de-b' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Zitat de-a' })).not.toBeInTheDocument();
    } finally {
      useAuthStore.setState({ isAuthenticated: false, user: null });
    }
  });
});

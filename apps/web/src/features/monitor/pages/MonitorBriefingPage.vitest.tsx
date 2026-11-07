import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { axe, renderWithProviders } from '../../../test-utils';

import { MonitorBriefingContent } from './MonitorBriefingPage';

const API = 'http://localhost/api/monitor';

const article = (i: number, title: string, primaryTopic: string | null = null) => ({
  url: `https://example.org/${i}`,
  title,
  source: 'Tagesschau',
  publishedAt: new Date(Date.now() - (i + 1) * 3600e3).toISOString(),
  excerpt: '',
  locale: 'de',
  topics: {},
  primaryTopic,
});

const snapshot = {
  id: 'snap-1',
  createdAt: '2026-11-06T22:40:00.000Z',
  topics: [
    { topic: 'sicherheit', score: 1, articleCount: 143, topArticles: [] },
    { topic: 'europa', score: 1, articleCount: 413, topArticles: [] },
  ],
  keywords: [
    { keyword: 'trump', count: 123, topic: null },
    { keyword: 'aigner', count: 65, topic: null },
  ],
  socialTrends: [
    { rank: 2, name: '#firstdates', url: 'https://x.com/search?q=firstdates' },
    { rank: 1, name: 'Ilse Aigner', url: 'https://x.com/search?q=Aigner' },
  ],
  totalArticles: 1179,
  sources: Array.from({ length: 46 }, (_, i) => `Quelle ${i}`),
  articlesByLocale: { de: 1179, at: 0 },
};

const greens = [
  article(1, 'Claudia Roth im Antisemitismus-Streit', 'justiz'),
  article(2, 'Grüne fordern Klimageld', 'justiz'),
  article(3, 'Grüne klagen gegen das Wahlrecht', 'justiz'),
  article(4, 'Özdemir will Pflichtjahr', 'bildung'),
  article(5, 'Grüne im Umfragetief'),
];

const lvArticle = {
  title: 'Bündnisgrüne für Rechenzentrumseuro',
  sourceUrl: 'https://gruene-brandenburg.de/pm',
  sourceGroupId: 'landesverbaende',
  sourceName: 'Grüne Brandenburg',
  excerpt: null,
  landesverband: 'BB',
  collection: 'landesverbaende_documents',
  eventType: 'stored',
  publishedAt: new Date(Date.now() - 14 * 3600e3).toISOString(),
  indexedAt: new Date().toISOString(),
  syncRunUrl: null,
};

function serve(greensArticles = greens) {
  server.use(
    http.get(`${API}/latest`, () => HttpResponse.json(snapshot)),
    http.get(`${API}/entities/:id`, ({ params }) =>
      HttpResponse.json({
        entity: { id: params.id, label: 'Die Grünen' },
        count: greensArticles.length,
        sources: ['Tagesschau'],
        articles: greensArticles,
      })
    ),
    http.get(`${API}/keyword-articles`, () =>
      HttpResponse.json({
        keywords: ['aigner'],
        articles: [1, 2, 3, 4, 5].map((i) => ({
          ...article(i, `Meldung ${i}`),
          matchedKeywords: ['aigner'],
        })),
      })
    ),
    http.get(`${API}/what-happened`, () =>
      HttpResponse.json({
        days: [{ date: '2026-11-06', counts: { stored: 1, updated: 0 }, articles: [lvArticle] }],
        totalCount: 1,
        sourceGroups: ['landesverbaende'],
        landesverbaende: ['BB'],
      })
    )
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
  // Die Monitor-Hooks legen ihre letzte Antwort in localStorage ab; jsdom behält sie über Tests hinweg.
  localStorage.clear();
});

describe('MonitorBriefingPage', () => {
  it('leads with the biggest topic of the day and of the Greens coverage', async () => {
    serve();
    renderWithProviders(<MonitorBriefingContent />, { route: '/briefing' });

    const lead = await screen.findByText(/die Nachrichten\./);
    expect(lead).toHaveTextContent(
      'Heute bestimmt Europa/Außen die Nachrichten. Über die Grünen wird vor allem zu Justiz/Recht berichtet.'
    );
    expect(
      screen.getByText(/^Stand \d\d:\d\d · 1.179 Artikel aus 46 Quellen$/)
    ).toBeInTheDocument();
  });

  it('only counts the Greens reports when no topic carries three of them', async () => {
    serve(greens.filter((a) => a.primaryTopic !== 'justiz' || a.url.endsWith('/1')));
    renderWithProviders(<MonitorBriefingContent />, { route: '/briefing' });

    expect(await screen.findByText(/die Nachrichten\./)).toHaveTextContent(
      'Über die Grünen gibt es heute 3 Berichte.'
    );
  });

  it('opens the card a lead topic points to', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(<MonitorBriefingContent />, { route: '/briefing' });

    await user.click(await screen.findByRole('button', { name: 'Justiz/Recht' }));
    expect(screen.getByRole('button', { name: 'Über die Grünen', expanded: true })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Themen', expanded: false })).toBeVisible();
  });

  it('shows three headlines per news card and the rest behind „Mehr"', async () => {
    serve();
    const user = userEvent.setup();
    renderWithProviders(<MonitorBriefingContent />, { route: '/briefing' });

    const toggle = await screen.findByRole('button', { name: 'Heute wichtig' });
    const body = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(body).not.toBeNull();
    expect(await within(body!).findAllByRole('link')).toHaveLength(3);

    const card = toggle.closest('section')!;
    await user.click(within(card).getByRole('button', { name: 'Mehr' }));
    expect(within(body!).getAllByRole('link')).toHaveLength(5);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Nur eine Karte zur Zeit.
    await user.click(screen.getByRole('button', { name: 'Keywords' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens the card named in the URL — /wissen links straight into the keywords', async () => {
    serve();
    renderWithProviders(<MonitorBriefingContent />, { route: '/briefing?karte=keywords' });

    expect(await screen.findByRole('button', { name: 'Keywords' })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
  });

  it('orders the X trends by rank and highlights the ones in the news', async () => {
    serve();
    renderWithProviders(<MonitorBriefingContent />, { route: '/briefing' });

    const list = await screen.findByRole('list', { name: 'Trends in Deutschland' });
    const links = within(list).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(['Ilse Aigner', '#firstdates']);
    expect(links[0].className).toContain('--dash-mg-ink');
    expect(links[1].className).not.toContain('--dash-mg-ink');
  });

  it('lists the Landesverband posts in Germany and drops the card in Austria', async () => {
    serve();
    const { unmount } = renderWithProviders(<MonitorBriefingContent />, { route: '/briefing' });
    expect(await screen.findByText('Bündnisgrüne für Rechenzentrumseuro')).toBeInTheDocument();
    unmount();

    serve();
    renderWithProviders(<MonitorBriefingContent />, { route: '/briefing?locale=at' });
    expect(await screen.findByRole('list', { name: 'Trends in Österreich' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Landesverbände' })).not.toBeInTheDocument();
  });

  it('holds lead and cards with skeletons while loading', async () => {
    const never = () => new Promise<never>(() => {});
    server.use(
      http.get(`${API}/latest`, never),
      http.get(`${API}/entities/:id`, never),
      http.get(`${API}/keyword-articles`, never),
      http.get(`${API}/what-happened`, never)
    );
    const { container } = renderWithProviders(<MonitorBriefingContent />, { route: '/briefing' });

    expect(await screen.findByRole('heading', { name: 'Briefing', level: 1 })).toBeVisible();
    expect(container.querySelectorAll('section[aria-busy="true"]')).toHaveLength(6);
    expect(screen.queryByText(/die Nachrichten/)).not.toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    serve();
    const { container } = renderWithProviders(<MonitorBriefingContent />, { route: '/briefing' });
    await screen.findByText(/die Nachrichten\./);
    expect(await axe(container)).toHaveNoViolations();
  });
});

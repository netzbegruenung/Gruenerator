import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

import { MonitorFeedContent } from './MonitorFeedPage';
import { MonitorThemenContent } from './MonitorThemenPage';

const MONITOR_LATEST = 'http://localhost/api/monitor/latest';
const BSKY_FEED = 'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed';
const WHAT_HAPPENED = 'http://localhost/api/monitor/what-happened';

const snapshot = {
  id: 'snap-1',
  createdAt: '2026-08-26T08:00:00.000Z',
  topics: [
    {
      topic: 'klima',
      articleCount: 12,
      topArticles: [{ title: 'Kohleausstieg vorgezogen', publishedAt: '2026-08-26T07:00:00.000Z' }],
    },
  ],
  keywords: [{ keyword: 'Klimageld', count: 9, topic: 'klima' }],
  socialTrends: [
    { rank: 1, name: '#Klimageld', url: 'https://x.com/search?q=%23Klimageld' },
    { rank: 2, name: '#Bundestag', url: 'https://x.com/search?q=%23Bundestag' },
  ],
  totalArticles: 120,
  sources: ['tagesschau'],
  articlesByLocale: { de: 120, at: 0 },
};

function serveMonitor() {
  server.use(
    http.get(MONITOR_LATEST, () => HttpResponse.json(snapshot)),
    http.get(BSKY_FEED, () =>
      HttpResponse.json({
        feed: [
          {
            post: {
              uri: 'at://did:plc:x/app.bsky.feed.post/abc',
              author: { handle: 'gruene-bundestag.de', displayName: 'Grüne Bundestag' },
              record: {
                text: 'Heute im Plenum: Wärmewende',
                createdAt: '2026-08-26T09:00:00.000Z',
              },
            },
          },
        ],
      })
    ),
    http.get(WHAT_HAPPENED, () =>
      HttpResponse.json({
        days: [
          {
            date: '2026-08-26',
            counts: { stored: 1, updated: 0 },
            articles: [
              {
                title: 'Landesparteitag beschliesst Wohnraumprogramm',
                sourceUrl: 'https://gruene-bayern.de/pm',
                sourceGroupId: 'landesverbaende',
                sourceName: 'Grüne Bayern',
                excerpt: null,
                landesverband: 'BY',
                collection: 'landesverbaende_documents',
                eventType: 'stored',
                publishedAt: '2026-08-26T07:00:00.000Z',
                indexedAt: '2026-08-26T08:00:00.000Z',
                syncRunUrl: null,
              },
            ],
          },
        ],
        totalCount: 1,
        sourceGroups: ['landesverbaende'],
        landesverbaende: ['BY'],
      })
    )
  );
}

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

afterEach(() => {
  server.resetHandlers();
});

describe('MonitorThemenPage', () => {
  it('shows the keyword cloud, the X trends and the topic ranking on one page', async () => {
    serveMonitor();

    renderWithProviders(<MonitorThemenContent />);

    expect(await screen.findByRole('heading', { name: 'Top-Keywords' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'X/Twitter Trends' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Themen-Ranking' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '#Klimageld' })).toHaveAttribute(
      'href',
      'https://x.com/search?q=%23Klimageld'
    );
  });

  it('says so when the snapshot carries no trends instead of rendering nothing', async () => {
    serveMonitor();
    server.use(
      http.get(MONITOR_LATEST, () => HttpResponse.json({ ...snapshot, socialTrends: [] }))
    );

    renderWithProviders(<MonitorThemenContent />);

    expect(await screen.findByText('Gerade keine Trends')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Top-Keywords' })).toBeInTheDocument();
  });

  // The list itself is scraped per locale on the backend (#2878); the label has
  // to follow, or Austrian users read "Deutschland" over Austrian trends.
  it('names the country the trends come from', async () => {
    serveMonitor();

    const { unmount } = renderWithProviders(<MonitorThemenContent />, { route: '/themen' });
    expect(await screen.findByText(/Top Trends in Deutschland/)).toBeInTheDocument();
    unmount();

    serveMonitor();
    renderWithProviders(<MonitorThemenContent />, { route: '/themen?locale=at' });
    expect(await screen.findByText(/Top Trends in Österreich/)).toBeInTheDocument();
  });

  it('no longer renders the hot-topic hero or the Bluesky grid', async () => {
    serveMonitor();

    renderWithProviders(<MonitorThemenContent />);

    expect(await screen.findByRole('heading', { name: 'Themen-Ranking' })).toBeInTheDocument();
    expect(screen.queryByText('Hot Topic')).not.toBeInTheDocument();
    expect(screen.queryByText('KI-Einordnung')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Von Bluesky' })).not.toBeInTheDocument();
  });
});

describe('MonitorFeedPage', () => {
  it('shows the Bluesky posts and the Landesverband articles together', async () => {
    serveMonitor();

    renderWithProviders(<MonitorFeedContent />);

    expect(await screen.findByRole('heading', { name: 'Von Bluesky' })).toBeInTheDocument();
    expect(screen.getByText('Heute im Plenum: Wärmewende')).toBeInTheDocument();

    expect(
      await screen.findByRole('heading', { name: 'Aus den Landesverbänden' })
    ).toBeInTheDocument();
    expect(
      await screen.findByText('Landesparteitag beschliesst Wohnraumprogramm')
    ).toBeInTheDocument();

    const lv = screen.getByRole('heading', { name: 'Aus den Landesverbänden' });
    const bluesky = screen.getByRole('heading', { name: 'Von Bluesky' });
    expect(lv.compareDocumentPosition(bluesky) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('KI-Zusammenfassung')).not.toBeInTheDocument();
  });

  // Der LV-Korpus ist rein deutsch — getWhatHappened nimmt `locale` entgegen,
  // engt damit aber nichts ein. Unter `at` blieben sonst deutsche
  // Landesverbands-Meldungen als oesterreichischer Feed stehen.
  it('drops the Landesverband stream under the Austrian locale', async () => {
    serveMonitor();

    renderWithProviders(<MonitorFeedContent />, { route: '/feed?locale=at' });

    expect(await screen.findByRole('heading', { name: 'Von Bluesky' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Aus den Landesverbänden' })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('Landesparteitag beschliesst Wohnraumprogramm')
    ).not.toBeInTheDocument();
  });
});

describe('MonitorThemenPage — Artikel zu den Top-Keywords', () => {
  it('lists the keyword-dense articles with the keywords they matched', async () => {
    server.use(
      http.get(MONITOR_LATEST, () =>
        HttpResponse.json({
          id: 's1',
          createdAt: '2026-10-03T08:00:00Z',
          topics: [],
          keywords: [{ keyword: 'Wehrpflicht', count: 12, topic: null }],
          socialTrends: [],
          totalArticles: 40,
          sources: ['Tagesschau'],
          articlesByLocale: { de: 40, at: 0 },
        })
      ),
      http.get('http://localhost/api/monitor/keyword-articles', () =>
        HttpResponse.json({
          keywords: ['Wehrpflicht', 'Bundeswehr'],
          articles: [
            {
              url: 'https://example.org/wehrpflicht',
              title: 'Streit um die Wehrpflicht',
              source: 'Tagesschau',
              publishedAt: '2026-10-03T07:00:00Z',
              excerpt: '',
              locale: 'de',
              topics: {},
              primaryTopic: null,
              matchedKeywords: ['Wehrpflicht', 'Bundeswehr'],
            },
          ],
        })
      )
    );

    renderWithProviders(<MonitorThemenContent />);

    expect(
      await screen.findByRole('heading', { name: 'Artikel zu den Top-Keywords' })
    ).toBeInTheDocument();
    const card = await screen.findByRole('link', { name: /Streit um die Wehrpflicht/ });
    expect(card).toHaveAttribute('href', 'https://example.org/wehrpflicht');
    expect(card).toHaveTextContent('Wehrpflicht · Bundeswehr');
  });
});

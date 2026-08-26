import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';
import { renderWithProviders } from '../../../test-utils';

import { MonitorFeedContent } from './MonitorFeedPage';
import { MonitorThemenContent } from './MonitorThemenPage';
import { MonitorTrendsContent } from './MonitorTrendsPage';

const MONITOR_LATEST = 'http://localhost/api/monitor/latest';
const MONITOR_BRIEFING = 'http://localhost/api/monitor/briefing';
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
    http.get(MONITOR_BRIEFING, () => HttpResponse.json({ briefing: '', citations: [] })),
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

describe('MonitorTrendsPage', () => {
  it('leads with the #1 X trend and lists the runners-up', async () => {
    serveMonitor();

    renderWithProviders(<MonitorTrendsContent />);

    expect(await screen.findByText('Top-Trend')).toBeInTheDocument();

    // The trend name also appears in the word cloud below, so pin the hero via
    // its heading rather than by link name alone.
    const heroHeading = await screen.findByRole('heading', { level: 2, name: '#Klimageld' });
    expect(within(heroHeading).getByRole('link')).toHaveAttribute(
      'href',
      'https://x.com/search?q=%23Klimageld'
    );

    const runnersUp = screen.getByText('Ebenfalls im Trend').parentElement;
    expect(runnersUp).not.toBeNull();
    expect(within(runnersUp!).getByRole('link', { name: /#Bundestag/ })).toHaveAttribute(
      'href',
      'https://x.com/search?q=%23Bundestag'
    );
  });

  it('owns the X/Twitter word cloud that used to sit on /themen', async () => {
    serveMonitor();

    renderWithProviders(<MonitorTrendsContent />);

    expect(await screen.findByRole('heading', { name: 'X/Twitter Trends' })).toBeInTheDocument();
  });

  // The list itself is scraped per locale on the backend (#2878); the label has
  // to follow, or Austrian users read "Deutschland" over Austrian trends.
  it('names the country the trends come from', async () => {
    serveMonitor();

    const { unmount } = renderWithProviders(<MonitorTrendsContent />, { route: '/trends' });
    expect(await screen.findByText(/Top Trends in Deutschland/)).toBeInTheDocument();
    unmount();

    serveMonitor();
    renderWithProviders(<MonitorTrendsContent />, { route: '/trends?locale=at' });
    expect(await screen.findByText(/Top Trends in Österreich/)).toBeInTheDocument();
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
  });
});

describe('MonitorTrendsPage after the Bluesky move', () => {
  it('no longer renders the Bluesky grid — it lives on /feed', async () => {
    serveMonitor();

    renderWithProviders(<MonitorTrendsContent />);

    expect(await screen.findByRole('heading', { name: 'X/Twitter Trends' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Von Bluesky' })).not.toBeInTheDocument();
  });
});

describe('MonitorThemenPage after the split', () => {
  it('keeps the topic ranking and the keyword cloud', async () => {
    serveMonitor();

    renderWithProviders(<MonitorThemenContent />);

    expect(await screen.findByRole('heading', { name: 'Themen-Ranking' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Top-Keywords' })).toBeInTheDocument();
  });

  it('no longer renders the trends or Bluesky blocks', async () => {
    serveMonitor();

    renderWithProviders(<MonitorThemenContent />);

    // Wait for the snapshot to land before asserting on absence.
    expect(await screen.findByRole('heading', { name: 'Themen-Ranking' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'X/Twitter Trends' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Von Bluesky' })).not.toBeInTheDocument();
  });
});

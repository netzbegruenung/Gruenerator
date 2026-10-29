import { type Plugin } from 'vite';

/**
 * Dev-only stand-ins for the data /wissen shows. A local stack under the dev
 * auth bypass has no notebook rows and no monitor runs, so the page renders
 * neither „Meine Notebooks" nor the live tool widgets.
 *
 * Enable with `DEV_MOCK_WISSEN=true pnpm dev:web`. Answers the notebook list
 * calls and the monitor calls the tool widgets read before the API proxy;
 * everything else still goes to the real backend.
 */

const DEV_USER_ID = '00000000-0000-4000-a000-000000000001';

const collection = (
  id: string,
  name: string,
  description: string,
  over: Record<string, unknown> = {}
) => ({
  id,
  user_id: DEV_USER_ID,
  name,
  description,
  creator_name: 'Test User',
  slug_suffix: id.slice(-6),
  is_public: false,
  likes_count: 0,
  documents: [],
  document_count: 3,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  ...over,
});

const OWN = [
  collection('mock-own-000001', 'Kommunalwahl 2026', 'Wahlprogramm, Anträge und Pressespiegel'),
  collection(
    'mock-own-000002',
    'Verkehrswende Land',
    'Studien und Beschlüsse zu ÖPNV und Radwegen'
  ),
  collection('mock-own-000003', 'Pressearbeit', 'Pressemitteilungen und Sprachregelungen'),
];

const SHARED = [
  collection('mock-shr-000001', 'Haushalt 2027', 'Entwurf und Änderungsanträge', {
    user_id: 'someone-else',
    creator_name: 'Jamie Grün',
    access_source: 'shared',
    shared_via_groups: ['KV Nord'],
  }),
];

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

const article = (title: string, source: string, m: number, topic: string | null = 'klima') => ({
  url: `https://example.org/${encodeURIComponent(title)}`,
  title,
  source,
  publishedAt: minutesAgo(m),
  excerpt: '',
  locale: 'de',
  topics: topic ? { [topic]: 1 } : {},
  primaryTopic: topic,
});

const SNAPSHOT = () => ({
  id: 'mock-snapshot',
  createdAt: minutesAgo(4),
  topics: [],
  keywords: [
    { keyword: 'Kohleausstieg', count: 9, topic: 'klima' },
    { keyword: 'Klimageld', count: 7, topic: 'klima' },
    { keyword: 'Wärmepumpe', count: 4, topic: 'klima' },
    { keyword: 'Bundestag', count: 2, topic: null },
  ],
  socialTrends: [
    { rank: 1, name: '#Klimageld', url: 'https://x.com/search?q=%23Klimageld' },
    { rank: 2, name: '#Heizungsgesetz', url: 'https://x.com/search?q=%23Heizungsgesetz' },
  ],
  totalArticles: 14,
  sources: ['taz', 'FAZ', 'Spiegel'],
  articlesByLocale: { de: 14, at: 0 },
});

const FEED = () => {
  const lv = (title: string, landesverband: string, m: number) => ({
    title,
    sourceUrl: `https://example.org/lv/${encodeURIComponent(title)}`,
    sourceGroupId: 'landesverbaende',
    sourceName: 'Landesverband',
    excerpt: null,
    landesverband,
    collection: 'landesverbaende_documents',
    eventType: 'stored',
    publishedAt: minutesAgo(m),
    indexedAt: minutesAgo(m),
    syncRunUrl: null,
  });
  return {
    days: [
      {
        date: minutesAgo(0).slice(0, 10),
        counts: { stored: 3, updated: 0 },
        articles: [
          lv('Landesparteitag beschließt Wohnraumprogramm', 'BY', 120),
          lv('Neue Radwege für den Kreis', 'NW', 300),
          lv('Antrag zur Hitzevorsorge', 'HH', 1500),
          lv('Bürgerdialog zur Verkehrswende startet', 'BW', 1800),
        ],
      },
    ],
    totalCount: 23,
    sourceGroups: ['landesverbaende'],
    landesverbaende: ['BY', 'NW', 'HH'],
  };
};

const ENTITY = () => ({
  entity: { id: 'gruene', label: 'Bündnis 90/Die Grünen' },
  count: 14,
  sources: ['taz', 'FAZ', 'Spiegel'],
  articles: [
    article('Grüne fordern Klimageld noch 2026', 'taz', 60),
    article('Streit um Heizungsförderung', 'FAZ', 180),
    article('Kohleausstieg vorgezogen – was das für die Regionen bedeutet', 'Spiegel', 240),
    article('Wärmepumpen-Förderung wird neu aufgelegt', 'Tagesschau', 420),
  ],
});

const POLLS = () => {
  const week = (i: number) =>
    new Date(Date.now() - (7 - i) * 7 * 86_400_000).toISOString().slice(0, 10);
  const values = [11.2, 11.5, 11.4, 11.9, 12.0, 11.8, 12.0, 12.5];
  return {
    polls: [],
    lastElection: null,
    average: { 'CDU/CSU': 27.0, AfD: 25.0, SPD: 16.5, GRÜNE: 12.5, 'DIE LINKE': 11.0 },
    scrapedAt: minutesAgo(30),
    source: 'politpro',
    parliament: 'deutschland',
    trend: { GRÜNE: values.map((value, i) => ({ date: week(i), value })) },
    diffs: { GRÜNE: 0.5 },
  };
};

const ROUTES: Record<string, () => unknown> = {
  '/api/auth/notebook-collections': () => ({ success: true, collections: OWN }),
  '/api/auth/notebook-collections/shared': () => ({ success: true, collections: SHARED }),
  '/api/monitor/latest': SNAPSHOT,
  '/api/monitor/what-happened': FEED,
  '/api/monitor/polls': POLLS,
  '/api/monitor/entities/gruene': ENTITY,
  '/api/monitor/entities/gruene-at': ENTITY,
};

export function wissenMockPlugin(): Plugin {
  return {
    name: 'dev-wissen-mock',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET') return next();
        const body = ROUTES[(req.url ?? '').split('?')[0]];
        if (!body) return next();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(body()));
      });
    },
  };
}

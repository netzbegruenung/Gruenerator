import { type Plugin } from 'vite';

/**
 * Dev-only stand-ins for the Vorlagen-Datenbank. A local stack has neither
 * gallery rows nor the Grünerator catalogue (that lives in the private
 * INTERN_CONTENT_DIR), so /vorlagen renders empty under the dev auth bypass.
 *
 * Enable with `DEV_MOCK_VORLAGEN=true pnpm dev:web`. Answers the two list
 * calls and the catalogue thumbnails before the API proxy; everything else
 * (likes, Merken, Kopie bearbeiten) still goes to the real backend.
 */

const svg = (w: number, h: number, fill: string, label: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  `<rect width="100%" height="100%" fill="${fill}"/>` +
  `<text x="50%" y="50%" fill="#fff" font-family="sans-serif" font-size="${Math.round(w / 12)}" ` +
  `text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;

const dataUri = (w: number, h: number, fill: string, label: string): string =>
  `data:image/svg+xml;utf8,${encodeURIComponent(svg(w, h, fill, label))}`;

const slide = (headline: string) => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'headline', lines: [headline] }],
  logo: true,
});

const CATALOGUE = [
  {
    id: 'mock-de-zitat',
    locale: 'de-DE',
    titel: 'Zitat auf Tanne',
    beschreibung: 'Ein starkes Zitat, groß auf Grün gesetzt.',
    form: 'zitat',
    herkunft: 'alt-template',
    chat: { prompts: ['Erstelle ein Zitat-Sharepic mit dem Satz „Bus statt Stau"'] },
    attributions: [null],
    spec: { locale: 'de-DE', format: 'post-portrait', slides: [slide('Bus statt Stau')] },
  },
  {
    id: 'mock-at-karussell',
    locale: 'de-AT',
    titel: 'Karussell in drei Schritten',
    beschreibung: 'Drei Seiten zum Durchwischen — Problem, Lösung, Aufruf.',
    form: 'zitat',
    herkunft: 'alt-template',
    chat: { prompts: ['Mach ein Karussell über Öffis am Land'] },
    attributions: [null],
    spec: {
      locale: 'de-AT',
      format: 'post-portrait',
      slides: [slide('Problem'), slide('Lösung'), slide('Mach mit')],
    },
  },
];

const GALLERY = [
  {
    id: 'mock-canva-plakat',
    title: 'Veranstaltungsplakat',
    description: 'A4-Plakat für Ortsverbands-Veranstaltungen mit Platz für Datum und Ort.',
    template_type: 'canva',
    tags: ['plakat', 'veranstaltung'],
    thumbnail_url: dataUri(800, 1131, '#005538', 'Plakat'),
    external_url: 'https://www.canva.com/',
    content_data: {
      originalUrl: 'https://www.canva.com/',
      dimensions: { width: 2480, height: 3508 },
    },
    metadata: { author_name: 'KV Musterstadt' },
    images: [
      { url: dataUri(800, 1131, '#005538', 'Plakat'), display_order: 0 },
      { url: dataUri(800, 1131, '#8ABD24', 'Rückseite'), display_order: 1 },
    ],
    likes_count: 4,
    created_at: '2026-09-01T10:00:00Z',
  },
  {
    id: 'mock-canva-story',
    title: 'Instagram-Story Wahlaufruf',
    template_type: 'canva',
    tags: ['story'],
    thumbnail_url: dataUri(540, 960, '#46962B', 'Story'),
    external_url: 'https://www.canva.com/',
    likes_count: 1,
    created_at: '2026-08-12T10:00:00Z',
  },
  {
    id: 'mock-download',
    title: 'Briefkopf (Word)',
    description: 'Briefvorlage zum Herunterladen.',
    template_type: 'word',
    thumbnail_url: dataUri(1240, 1754, '#F5F1E9', 'Brief'),
    download_url: 'https://example.org/briefkopf.docx',
    created_at: '2026-07-20T10:00:00Z',
  },
];

const THUMB = /^\/api\/sharepic-vorlagen\/([^/?]+)\/thumb(?:\?seite=(\d+))?/;

export function vorlagenMockPlugin(): Plugin {
  return {
    name: 'dev-vorlagen-mock',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? '';
        if (req.method !== 'GET') return next();
        const json = (body: unknown) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };
        const path = url.split('?')[0];
        if (path === '/api/sharepic-vorlagen') return json({ vorlagen: CATALOGUE });
        if (path === '/api/auth/vorlagen') return json({ vorlagen: GALLERY });
        const thumb = THUMB.exec(url);
        if (thumb) {
          res.setHeader('Content-Type', 'image/svg+xml');
          return res.end(svg(1080, 1350, '#005538', `Seite ${thumb[2] ?? 1}`));
        }
        next();
      });
    },
  };
}

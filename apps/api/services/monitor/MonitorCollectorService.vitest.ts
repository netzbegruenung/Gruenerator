import { describe, expect, it } from 'vitest';

import { parseNewsSitemap } from './MonitorCollectorService.js';

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
  <url>
    <loc>https://www.noen.at/hollabrunn/neu-a1</loc>
    <news:news>
      <news:publication><news:name><![CDATA[NÖN]]></news:name><news:language>de</news:language></news:publication>
      <news:publication_date>2026-11-06T22:45:00+00:00</news:publication_date>
      <news:title><![CDATA[Neue Radwege für Hollabrunn]]></news:title>
    </news:news>
  </url>
  <url>
    <loc>https://www.noen.at/alt-a2</loc>
    <news:news>
      <news:publication><news:name>NÖN</news:name></news:publication>
      <news:publication_date>2026-11-01T08:00:00+00:00</news:publication_date>
      <news:title>Zu alt</news:title>
    </news:news>
  </url>
  <url>
    <loc>https://www.noen.at/ohne-titel-a3</loc>
  </url>
</urlset>`;

describe('parseNewsSitemap', () => {
  it('takes headline, link and date of recent entries only', () => {
    const items = parseNewsSitemap(SITEMAP, 'noen.at', new Date('2026-11-06T00:00:00Z'));

    expect(items).toEqual([
      {
        url: 'https://www.noen.at/hollabrunn/neu-a1',
        title: 'Neue Radwege für Hollabrunn',
        excerpt: '',
        source: 'NÖN',
        publishedAt: '2026-11-06T22:45:00+00:00',
        locale: 'at',
      },
    ]);
  });

  it('tags German outlets as de', () => {
    const [item] = parseNewsSitemap(SITEMAP, 'stuttgarter-zeitung.de', new Date(0));
    expect(item.locale).toBe('de');
  });
});

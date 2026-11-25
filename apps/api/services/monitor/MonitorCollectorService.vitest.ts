import { describe, expect, it } from 'vitest';

import { parseFeedXml, parseNewsSitemap } from './MonitorCollectorService.js';

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

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>NDR</title>
    <link>https://www.ndr.de</link>
    <lastBuildDate>Wed, 25 Nov 2026 16:42:56 +0000</lastBuildDate>
    <item>
      <title>Lennart Meyer &amp;amp; PEACE</title>
      <link>https://www.ndr.de/a</link>
      <pubDate>Wed, 25 Nov 2026 17:45:02 +0100</pubDate>
    </item>
    <item>
      <title>Park&amp;#x26;Ride und AT&amp;T</title>
      <link>https://www.ndr.de/b</link>
    </item>
    <item>
      <title>Zu alt</title>
      <link>https://www.ndr.de/old</link>
      <pubDate>Mon, 01 Jan 2024 08:00:00 +0100</pubDate>
    </item>
    <item>
      <title>Ohne Link</title>
    </item>
  </channel>
</rss>`;

describe('parseFeedXml', () => {
  const SINCE = new Date('2026-11-25T00:00:00Z');

  it('keeps headline + link, filters by since and skips linkless items', async () => {
    const items = await parseFeedXml(FEED, 'ndr.de', SINCE);
    expect(items.map((i) => i.url)).toEqual(['https://www.ndr.de/a', 'https://www.ndr.de/b']);
    expect(items[0]).toMatchObject({
      title: 'Lennart Meyer & PEACE',
      excerpt: '',
      source: 'NDR',
      publishedAt: new Date('Wed, 25 Nov 2026 17:45:02 +0100').toISOString(),
      locale: 'de',
    });
  });

  it('decodes double-escaped entities once and leaves plain text alone', async () => {
    const items = await parseFeedXml(FEED, 'ndr.de', SINCE);
    // raw &amp;#x26; → parse → &#x26; → fix → &; raw &amp; → parse → & → unangetastet
    expect(items[1].title).toBe('Park&Ride und AT&T');
  });

  it('falls back to the channel lastBuildDate for undated items (vienna.at, #6078)', async () => {
    const items = await parseFeedXml(FEED, 'ndr.de', SINCE);
    expect(items[1].publishedAt).toBe('Wed, 25 Nov 2026 16:42:56 +0000');
  });

  it('drops undated items when even the channel date is older than since', async () => {
    const items = await parseFeedXml(FEED, 'ndr.de', new Date('2026-11-26T00:00:00Z'));
    expect(items).toEqual([]);
  });

  it('tags Austrian outlets as at', async () => {
    const [item] = await parseFeedXml(FEED, 'nachrichten.at', SINCE);
    expect(item.locale).toBe('at');
  });
});

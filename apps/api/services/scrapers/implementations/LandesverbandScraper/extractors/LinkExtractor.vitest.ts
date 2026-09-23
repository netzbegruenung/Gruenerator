/**
 * `staticUrls` auf PDF-Archiv-Pfaden (#3579).
 *
 * `extractPdfLinks` holte bislang immer die Listing-Seite (`baseUrl + path`)
 * und scannte sie nach `.pdf`-Links — `staticUrls` griff nur im HTML-Zweig.
 * Bei LSA verlinkt die Startseite kein PDF, das Wahlprogramm wurde nie
 * gefunden. Diese Tests sichern den Fix: `staticUrls` überspringt den Fetch
 * komplett, der Listing-Pfad bleibt unverändert.
 */
import { describe, it, expect, vi } from 'vitest';

import { LinkExtractor, titleFromPdfUrl } from './LinkExtractor.js';

import type {
  LandesverbandSource,
  ContentPath,
} from '../../../../../config/landesverbaendeConfig.js';

function makeSource(overrides: Partial<LandesverbandSource> = {}): LandesverbandSource {
  return {
    id: 'sachsen-anhalt-lv',
    name: 'Grüne Sachsen-Anhalt',
    shortName: 'LSA',
    type: 'landesverband',
    baseUrl: 'https://www.gruene-lsa.de',
    cms: 'wordpress',
    contentPaths: [],
    contentSelectors: { title: [], date: [], content: [], categories: [], author: [] },
    excludePatterns: [],
    ...overrides,
  };
}

// Same resolution the real scraper injects (#normalizeUrl in LandesverbandScraper.ts):
// absolute URLs pass through unchanged.
function normalizeUrl(url: string | undefined, baseUrl: string): string | null {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/')) return baseUrl + url;
  return baseUrl + '/' + url;
}

describe('LinkExtractor.extractPdfLinks — staticUrls', () => {
  it('returns the static URLs as PdfLinks without fetching the listing page', async () => {
    const fetchUrl = vi.fn();
    const extractor = new LinkExtractor(
      fetchUrl,
      normalizeUrl,
      () => false,
      () => Promise.resolve()
    );

    const source = makeSource();
    const contentPath: ContentPath = {
      type: 'wahlprogramm',
      path: '/',
      listSelector: 'a[href$=".pdf"]',
      isPdfArchive: true,
      processUndatedPdfs: true,
      staticUrls: [
        'https://www.gruene-lsa.de/wp-content/uploads/2026/05/Programm-zur-Landtagswahl-2026.pdf',
      ],
      disableOffPathFilter: true,
    };

    const links = await extractor.extractPdfLinks(source, contentPath);

    expect(links).toEqual([
      {
        url: 'https://www.gruene-lsa.de/wp-content/uploads/2026/05/Programm-zur-Landtagswahl-2026.pdf',
        title: 'Programm zur Landtagswahl 2026',
        context: '',
      },
    ]);
    expect(fetchUrl).not.toHaveBeenCalled();
  });

  it('resolves a relative static URL against the source baseUrl', async () => {
    const fetchUrl = vi.fn();
    const extractor = new LinkExtractor(
      fetchUrl,
      normalizeUrl,
      () => false,
      () => Promise.resolve()
    );

    const source = makeSource({ baseUrl: 'https://gruene-sachsen.de' });
    const contentPath: ContentPath = {
      type: 'wahlprogramm',
      path: '/',
      listSelector: 'a[href$=".pdf"]',
      isPdfArchive: true,
      staticUrls: ['/wp-content/uploads/2024/08/programm.pdf'],
    };

    const links = await extractor.extractPdfLinks(source, contentPath);

    expect(links).toEqual([
      {
        url: 'https://gruene-sachsen.de/wp-content/uploads/2024/08/programm.pdf',
        title: 'programm',
        context: '',
      },
    ]);
    expect(fetchUrl).not.toHaveBeenCalled();
  });

  it('dedupes staticUrls that normalize to the same URL, keeping the first', async () => {
    const fetchUrl = vi.fn();
    const extractor = new LinkExtractor(
      fetchUrl,
      normalizeUrl,
      () => false,
      () => Promise.resolve()
    );

    const source = makeSource();
    const contentPath: ContentPath = {
      type: 'wahlprogramm',
      path: '/',
      listSelector: 'a[href$=".pdf"]',
      isPdfArchive: true,
      staticUrls: [
        'https://www.gruene-lsa.de/wp-content/uploads/2026/05/Programm-zur-Landtagswahl-2026.pdf',
        // Same document, written relative — a plausible copy/paste slip in a
        // hand-maintained config list. Must normalize to the same URL and be
        // dropped, not OCR'd/stored twice.
        '/wp-content/uploads/2026/05/Programm-zur-Landtagswahl-2026.pdf',
      ],
    };

    const links = await extractor.extractPdfLinks(source, contentPath);

    expect(links).toEqual([
      {
        url: 'https://www.gruene-lsa.de/wp-content/uploads/2026/05/Programm-zur-Landtagswahl-2026.pdf',
        title: 'Programm zur Landtagswahl 2026',
        context: '',
      },
    ]);
    expect(fetchUrl).not.toHaveBeenCalled();
  });
});

describe('titleFromPdfUrl', () => {
  it('turns dash/underscore-separated filenames into a readable title', () => {
    expect(
      titleFromPdfUrl(
        'https://www.gruene-lsa.de/wp-content/uploads/2026/05/Programm-zur-Landtagswahl-2026.pdf'
      )
    ).toBe('Programm zur Landtagswahl 2026');
  });

  it('decodes percent-encoded umlauts', () => {
    expect(titleFromPdfUrl('https://example.org/docs/Wahlprogramm_f%C3%BCr_2026.pdf')).toBe(
      'Wahlprogramm für 2026'
    );
  });

  it('collapses runs of separators and mixed dash/underscore', () => {
    expect(titleFromPdfUrl('https://example.org/a--b__c.pdf')).toBe('a b c');
  });

  it('falls back to the raw filename when decoding fails', () => {
    expect(titleFromPdfUrl('https://example.org/broken-%E0-name.pdf')).toBe('broken %E0 name');
  });
});

describe('LinkExtractor.extractPdfLinks — listing page (unchanged)', () => {
  it('still fetches and scans the listing page when staticUrls is absent', async () => {
    // Tiny synthetic listing fixture — not a live-site excerpt, so it lives
    // inline instead of __fixtures__ (kept small enough to read in place).
    const html = `
      <html><body>
        <h3>Mai 2026</h3>
        <div class="archive">
          <a href="/wp-content/uploads/2026/05/bericht.pdf">Bericht Mai 2026</a>
        </div>
      </body></html>
    `;
    const fetchUrl = vi.fn().mockResolvedValue(new Response(html));
    const extractor = new LinkExtractor(
      fetchUrl,
      normalizeUrl,
      () => false,
      () => Promise.resolve()
    );

    const source = makeSource();
    const contentPath: ContentPath = {
      type: 'wahlprogramm',
      path: '/archiv/',
      listSelector: '.archive a[href]',
      isPdfArchive: true,
    };

    const links = await extractor.extractPdfLinks(source, contentPath);

    expect(fetchUrl).toHaveBeenCalledWith('https://www.gruene-lsa.de/archiv/');
    expect(links).toEqual([
      {
        url: 'https://www.gruene-lsa.de/wp-content/uploads/2026/05/bericht.pdf',
        title: 'Bericht Mai 2026',
        context: 'Mai 2026 | Bericht Mai 2026',
      },
    ]);
  });
});

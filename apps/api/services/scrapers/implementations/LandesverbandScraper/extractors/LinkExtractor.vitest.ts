/**
 * `staticUrls` auf PDF-Archiv-Pfaden (#3579).
 *
 * `extractPdfLinks` holte bislang immer die Listing-Seite (`baseUrl + path`)
 * und scannte sie nach `.pdf`-Links — `staticUrls` griff nur im HTML-Zweig.
 * Bei LSA verlinkt die Startseite kein PDF, das Wahlprogramm wurde nie
 * gefunden. Diese Tests sichern den Fix: `staticUrls` überspringt den Fetch
 * komplett, der Listing-Pfad bleibt unverändert.
 *
 * Generische Linktexte (#3577): „Herunterladen" oder ein Icon-Anker ohne Text
 * sind keine Titel. Bis hierher hießen alle zwölf MV-Beschlüsse „Dokument" und
 * das Brandenburger Wahlprogramm „Herunterladen".
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { DateExtractor } from './DateExtractor.js';
import { isGenericLinkText, LinkExtractor, titleFromPdfUrl } from './LinkExtractor.js';

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

const SOURCE = { baseUrl: 'https://gruene-mv.de' } as LandesverbandSource;
const CONTENT_PATH = { path: '/parteitags-beschluesse/', listSelector: 'a' } as ContentPath;

function extractor(html: string) {
  return new LinkExtractor(
    () => Promise.resolve(new Response(html)),
    (url) => (url ? new URL(url, SOURCE.baseUrl).href : null),
    () => false,
    () => Promise.resolve()
  );
}

describe('isGenericLinkText', () => {
  it.each(['Dokument', 'Herunterladen', ' download ', 'PDF', 'hier', 'Hier.', 'Download:', ''])(
    'treats %j as generic',
    (text) => {
      expect(isGenericLinkText(text)).toBe(true);
    }
  );

  it.each(['Protokoll der LDK Güstrow', 'Download-Bereich Satzung', 'PDF-Leitfaden'])(
    'keeps %j',
    (text) => {
      expect(isGenericLinkText(text)).toBe(false);
    }
  );
});

describe('extractPdfLinks — titles', () => {
  it('takes the title from the text anchor when an icon anchor to the same URL comes first', async () => {
    const html = `
      <li>
        <a href="/download/protokoll-der-ldk-guestrow-12-oktober-2024/"><i class="icon"></i></a>
        <a href="/download/protokoll-der-ldk-guestrow-12-oktober-2024/">Protokoll der LDK Güstrow 12. Oktober 2024</a>
      </li>`;

    const links = await extractor(html).extractPdfLinks(SOURCE, CONTENT_PATH);

    expect(links).toHaveLength(1);
    expect(links[0].title).toBe('Protokoll der LDK Güstrow 12. Oktober 2024');
  });

  it('does not use a "Herunterladen" button as the title', async () => {
    const html = `
      <div class="wp-block-file">
        <a href="/wp-content/uploads/2024/05/wahlprogramm-ltw-2024.pdf">Wahlprogramm LTW 2024</a>
        <a href="/wp-content/uploads/2024/05/wahlprogramm-ltw-2024.pdf" class="wp-block-file__button">Herunterladen</a>
      </div>
      <div class="wp-block-file">
        <a href="/wp-content/uploads/2024/05/kurzprogramm.pdf" class="wp-block-file__button">Herunterladen</a>
      </div>`;

    const links = await extractor(html).extractPdfLinks(SOURCE, CONTENT_PATH);

    expect(links.map((l) => l.title)).toEqual(['Wahlprogramm LTW 2024', 'Dokument']);
  });
});

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

async function linksFromFixture(file: string, baseUrl: string, listSelector: string) {
  const html = readFileSync(path.join(FIXTURES, file), 'utf8');
  const source = { baseUrl } as LandesverbandSource;
  const links = await extractor(html).extractPdfLinks(source, {
    path: '/',
    listSelector,
  } as ContentPath);
  return (slug: string) => {
    const link = links.find((l) => l.url.includes(slug));
    if (!link) throw new Error(`no link for ${slug}`);
    return {
      ...link,
      date: DateExtractor.extractDateFromPdfInfo(link.url, link.title, link.context, 10),
    };
  };
}

/**
 * Das Datum stand auf der Seite direkt über dem Link — es kam nur nicht im
 * Kontext an, also erfand DateExtractor den 15. Juni (#3575).
 */
describe('extractPdfLinks — context carries the date (#3575)', () => {
  it('BB: the dated h3 is a sibling of the link paragraph', async () => {
    const link = await linksFromFixture(
      'gruene-bb-archiv-beschluesse-2022.html',
      'https://archiv.gruene-brandenburg.de',
      'a[href$=".pdf"]'
    );

    expect(link('L1NEU_Halbzeit').context).toContain('Landesdelegiertenkonferenz am 26.03.22');
    expect(link('L1NEU_Halbzeit').date.dateString).toBe('2022-03-26');
    expect(link('V11NEU_2024').context).toContain('Landesdelegiertenkonferenz am 19.11.22');
    expect(link('V11NEU_2024').date.dateString).toBe('2022-11-19');
  });

  it('MV: the last dated Elementor heading before the download widget', async () => {
    const link = await linksFromFixture(
      'gruene-mv-parteitags-beschluesse.html',
      'https://gruene-mv.de',
      'a[href*="/download/"], a[href$=".pdf"], article a[href]'
    );

    expect(link('meilensteine-zur-landtagswahl-2026').context).toContain(
      '24. Mai 2025 - LDK Güstrow'
    );
    expect(link('meilensteine-zur-landtagswahl-2026').date).toMatchObject({
      dateString: '2025-05-24',
      precision: 'day',
    });
    // Zwischen "24. September 2022" und dem Widget steht noch "26. März 2022".
    expect(link('kommunalwahl-2024').context).toContain('26. März 2022 - LDR Greifswald');
    expect(link('kommunalwahl-2024').date.dateString).toBe('2022-03-26');
  });

  it('Elementor: an undated section heading stops the walk back to an older dated one', async () => {
    const html = `
      <div class="e-con">
        <div class="elementor-widget elementor-widget-heading"><h3>24. Mai 2025 - LDK Güstrow</h3></div>
        <div class="elementor-widget"><a href="/download/beschluss-a/">Beschluss A</a></div>
        <div class="elementor-widget elementor-widget-heading"><h2>Satzung und Geschäftsordnung</h2></div>
        <div class="elementor-widget"><a href="/download/satzung/">Satzung</a></div>
      </div>`;

    const links = await extractor(html).extractPdfLinks(SOURCE, CONTENT_PATH);
    const satzung = links.find((l) => l.url.includes('satzung'));

    expect(links.find((l) => l.url.includes('beschluss-a'))?.context).toContain('24. Mai 2025');
    expect(satzung?.context).not.toContain('24. Mai 2025');
    expect(
      DateExtractor.extractDateFromPdfInfo(satzung!.url, satzung!.title, satzung!.context, 10)
        .dateString
    ).toBeNull();
  });

  it('Elementor: an undated stop is final, the unbounded container walk does not undo it', async () => {
    // The dated h3 is a direct sibling of the list; the undated h4 sits one
    // level deeper, so the container walk alone would skip it.
    const html = `
      <div class="elementor-widget">
        <h3>24. Mai 2025 - LDK Güstrow</h3>
        <div class="inner"><h4>Satzung und Geschäftsordnung</h4></div>
        <div class="list"><a href="/download/satzung/">Satzung</a></div>
      </div>`;

    const [satzung] = await extractor(html).extractPdfLinks(SOURCE, CONTENT_PATH);

    expect(satzung.context).not.toContain('24. Mai 2025');
    expect(
      DateExtractor.extractDateFromPdfInfo(satzung.url, satzung.title, satzung.context, 10)
        .dateString
    ).toBeNull();
  });

  it('BE-F: the file-name anchor of a dlm-downloads item reaches the context', async () => {
    const link = await linksFromFixture(
      'gruene-fraktion-berlin-beschluesse-dlm.html',
      'https://gruene-fraktion.berlin',
      'ul.dlm-downloads a[href*="/download/"]'
    );

    const neutralitaet = link('positionspapier-neutralitaetsgesetz-abschaffen');
    expect(neutralitaet.context).toContain('20230905_Neutralitaetsgesetz-abschaffen.pdf');
    expect(neutralitaet.date).toMatchObject({ dateString: '2023-09-05', precision: 'day' });
  });
});

/**
 * Linktexte wie „Herunterladen" oder ein Icon-Anker ohne Text sind keine
 * Titel. Bis hierher hießen alle zwölf MV-Beschlüsse „Dokument" und das
 * Brandenburger Wahlprogramm „Herunterladen" (#3577).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { DateExtractor } from './DateExtractor.js';
import { isGenericLinkText, LinkExtractor } from './LinkExtractor.js';

import type {
  ContentPath,
  LandesverbandSource,
} from '../../../../../config/landesverbaendeConfig.js';

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

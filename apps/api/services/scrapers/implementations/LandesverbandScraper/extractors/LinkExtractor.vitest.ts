/**
 * Linktexte wie „Herunterladen" oder ein Icon-Anker ohne Text sind keine
 * Titel. Bis hierher hießen alle zwölf MV-Beschlüsse „Dokument" und das
 * Brandenburger Wahlprogramm „Herunterladen" (#3577).
 */
import { describe, expect, it } from 'vitest';

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

/**
 * Titel der Berliner Landesverbandsseiten (#3560).
 *
 * gruene.berlin (TYPO3 xBlog) hat auf den Einzelseiten kein `<h1>`. Der
 * Titel-Selektor fiel deshalb auf `og:title` durch — und den füllt
 * EXT:seo_dynamic_tag mit „Titel: Anrisstext...", doppelt maskiertem `&nbsp;`
 * und Zeilenumbrüchen. Die Fixtures sind gekürzte Mitschnitte echter Seiten.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getSourceById } from '../../../../../config/landesverbaendeConfig.js';

import { ContentExtractor } from './ContentExtractor.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');

function fixtureFetch(file: string) {
  const html = readFileSync(path.join(FIXTURES, file), 'utf8');
  return () => Promise.resolve(new Response(html));
}

function berlinSource(id: 'berlin-lv-presse' | 'berlin-lv-beschluesse') {
  const source = getSourceById(id);
  if (!source) throw new Error(`Quelle ${id} fehlt in der Konfiguration`);
  return source;
}

describe('ContentExtractor — Berliner Einzelseiten', () => {
  it.each([
    [
      'berlin-lv-beschluesse' as const,
      'gruene-berlin-wahlprogramm-kapitel-3.html',
      'Unser Wahlprogramm - Kapitel 3',
      '2026-03-27T15:20:03',
    ],
    [
      'berlin-lv-beschluesse' as const,
      'gruene-berlin-beschluss-pflegenottelefon.html',
      'Pflegenottelefon für Berlin – schnelle Hilfe im Pflegekrisenfall',
      '2025-12-17T10:59:01',
    ],
    [
      'berlin-lv-presse' as const,
      'gruene-berlin-pressemitteilung-expo.html',
      'EXPO-Absage von Wegner: Wer regiert Berlin?',
      '2026-05-06T12:30:36',
    ],
  ])('%s / %s: Titel aus der Einzelansicht, ohne Anrisstext', async (id, file, title, date) => {
    const extracted = await ContentExtractor.extractPageContent(
      'https://gruene.berlin/x',
      berlinSource(id),
      fixtureFetch(file)
    );

    expect(extracted.title).toBe(title);
    expect(extracted.publishedAt).toBe(date);
  });

  it('nimmt nicht die <h2> einer Kachel aus der Seitenleiste', async () => {
    const extracted = await ContentExtractor.extractPageContent(
      'https://gruene.berlin/x',
      berlinSource('berlin-lv-presse'),
      fixtureFetch('gruene-berlin-pressemitteilung-expo.html')
    );

    expect(extracted.title).not.toContain('Safe Space');
  });

  it('räumt auch den og:title-Rückfall auf, wenn die Einzelansicht fehlt', async () => {
    const extracted = await ContentExtractor.extractPageContent(
      'https://gruene.berlin/x',
      {
        cms: 'typo3',
        contentSelectors: { title: ['h1', 'meta[property="og:title"]'], date: [], content: [] },
      },
      fixtureFetch('gruene-berlin-wahlprogramm-kapitel-3.html')
    );

    expect(extracted.title).not.toMatch(/&nbsp;|\n| /);
    expect(extracted.title.startsWith('Unser Wahlprogramm - Kapitel 3: Berlin gestaltet')).toBe(
      true
    );
  });
});

describe('ContentExtractor.normalizeTitle', () => {
  it('macht aus &nbsp; (auch doppelt maskiert) und U+00A0 ein Leerzeichen', () => {
    expect(ContentExtractor.normalizeTitle('Haltung ist&nbsp;hot')).toBe('Haltung ist hot');
    expect(ContentExtractor.normalizeTitle('Haltung ist hot')).toBe('Haltung ist hot');
  });

  it('zieht Zeilenumbrüche und Mehrfach-Leerzeichen zusammen und trimmt', () => {
    expect(ContentExtractor.normalizeTitle('  Kapitel 3: \n Berlin\t gestaltet  ')).toBe(
      'Kapitel 3: Berlin gestaltet'
    );
  });

  it('lässt einen sauberen Titel unverändert', () => {
    const title = 'Pflegenottelefon für Berlin – schnelle Hilfe im Pflegekrisenfall';
    expect(ContentExtractor.normalizeTitle(title)).toBe(title);
  });
});

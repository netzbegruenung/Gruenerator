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

function sourceById(id: string) {
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

/**
 * Seitenchrome im Artikeltext (#3574): der konfigurierte Content-Selektor (oder
 * der main/body-Rückfall) zieht mehr als den Artikel — verwandte Beiträge,
 * Kontaktboxen, Share-Leisten, Widget-Listen, Navigation. Fixtures sind
 * gekürzte Mitschnitte echter Einzelseiten je Quelle.
 */
describe('ContentExtractor — Seitenchrome im Artikeltext (#3574)', () => {
  it('hessen-fraktion: .daten zieht keine verwandten Pressemitteilungen mehr', async () => {
    const extracted = await ContentExtractor.extractPageContent(
      'https://www.gruene-hessen.de/landtag/pressemitteilungen/rechtsextreme-im-hessischen-landtag/',
      sourceById('hessen-fraktion'),
      fixtureFetch('gruene-hessen-fraktion-rechtsextreme-im-landtag.html')
    );

    expect(extracted.text).toContain(
      'Jetzt wurde die Einstufung der Jungen Alternativen (JA) als gesichert rechtsextrem gerichtlich bestätigt'
    );
    expect(extracted.text).not.toContain('Pressemitteilungen zum Thema');
    expect(extracted.text).not.toContain('Wirtschaft nicht mit rassistischer Ideologie');
    expect(extracted.text).not.toContain('Rechtes Vernetzungstreffen in Frankfurt');
  });

  it('hessen-lv: .daten bleibt sauber, wenn keine verwandten Beiträge auf der Seite stehen', async () => {
    const extracted = await ContentExtractor.extractPageContent(
      'https://www.gruene-hessen.de/partei/presse/gruene-gratulieren-manuela-rottmann-zum-historisch-besten-ergebnis/',
      sourceById('hessen-lv'),
      fixtureFetch('gruene-hessen-lv-manuela-rottmann.html')
    );

    expect(extracted.text).toContain(
      'Wir gratulieren Manuela Rottmann zum historisch besten Ergebnis'
    );
    expect(extracted.text).not.toContain('Pressemitteilungen zum Thema');
  });

  it('bayern-fraktion-presse: Share-Leiste und Kontaktbox bleiben draußen', async () => {
    const extracted = await ContentExtractor.extractPageContent(
      'https://www.gruene-fraktion-bayern.de/themen/umwelt-natur/2023/grundwasser-schuetzen-ausverkauf-verhindern/',
      sourceById('bayern-fraktion-presse'),
      fixtureFetch('gruene-fraktion-bayern-grundwasser-schuetzen.html')
    );

    expect(extracted.text).toContain('Grundwasser ist unser wichtigstes Gut');
    expect(extracted.text).not.toContain('Teilen teilen kontaktieren');
    expect(extracted.text).not.toContain('Tel: 089 4126-2553');
  });

  it('mecklenburg-vorpommern-lv: nur der Elementor-Textwidget-Inhalt, keine Datum/Titel/Taxonomie-Widgets', async () => {
    const extracted = await ContentExtractor.extractPageContent(
      'https://gruene-mv.de/land-muss-die-frauenhaus-kapazitaeten-massiv-erhoehen/',
      sourceById('mecklenburg-vorpommern-lv'),
      fixtureFetch('gruene-mv-frauenhaus-kapazitaeten.html')
    );

    expect(extracted.text).toContain('Am 8. März wird der Internationale Frauentag begangen');
    expect(extracted.text).not.toContain('Gleichstellung, Pressemitteilungen');
    expect(extracted.text).not.toContain('05. März 2025');
  });

  it('sachsen-anhalt-fraktion: .columns__cell--size-70 behält den Anrisstext, verliert nicht den Rückweg zu neos-contentcollection', async () => {
    const extracted = await ContentExtractor.extractPageContent(
      'https://gruene-fraktion-sachsen-anhalt.de/pressemitteilungen/reerdigung-per-gesetz-ermoeglichen',
      sourceById('sachsen-anhalt-fraktion'),
      fixtureFetch('gruene-fraktion-sachsen-anhalt-reerdigung.html')
    );

    expect(extracted.text).toContain(
      'Die Landtagsfraktion Bündnis 90/Die Grünen fordert die Landesregierung auf, Reerdigung als Bestattungsform gesetzlich zu ermöglichen'
    );
    expect(extracted.text).toContain('Kleine Anfrage von Cornelia Lüddemann');
    expect(extracted.text).not.toContain('Foto: pixabay/pexels.com');
    expect(extracted.text).not.toContain('Hier gelangen Sie zurück zur Übersicht');
  });

  it('berlin-lv-beschluesse: eine kurze Seite fällt nicht auf body zurück (135 < 200 Zeichen)', async () => {
    const extracted = await ContentExtractor.extractPageContent(
      'https://gruene.berlin/beschluesse/ausserordentliche-flinta-vollversammlung_3565',
      berlinSource('berlin-lv-beschluesse'),
      fixtureFetch('gruene-berlin-beschluss-flinta-vollversammlung.html')
    );

    expect(extracted.text).toBe(
      '09.04.25 – Beschluss auf dem Landesausschuss:Der Landesausschuss beschließt, eine außerordentliche FLINTA-Vollversammlung einzuberufen.'
    );
    expect(extracted.text).not.toContain('Kontakt');
    expect(extracted.text).not.toContain('Kategorie');
    expect(extracted.text).not.toContain('Listenansicht');
    expect(extracted.text).not.toContain('Zurück');
    expect(extracted.bodyFallback).toBe(false);
  });
});

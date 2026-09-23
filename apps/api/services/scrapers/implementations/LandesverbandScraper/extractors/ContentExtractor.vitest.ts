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

import * as cheerio from 'cheerio';
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
    expect(extracted.text).not.toContain('24.11.2022');
  });

  it('hessen-fraktion: Rückfallselektor .inhalt.einspaltig:not(.keindruck) schließt den Verwandten-Block ebenfalls aus', async () => {
    // .daten ist hier kein direktes Kind von .inhalt — die Primärregel
    // `.inhalt:not(.keindruck) > .daten` trifft also nicht, und der Rückfall
    // `.inhalt.einspaltig:not(.keindruck)` muss greifen, ohne den
    // Verwandten-Block ("keindruck") mitzunehmen.
    const html = `<!DOCTYPE html><html><body>
      <div class="inhalt einspaltig padding-rechts-80">
        <div class="wrapper">
          <div class="daten"><h1 class="eintrag-titel">Titel des Artikels</h1>
          <p>${'Ein hinreichend langer Artikeltext, der die Zweihundert-Zeichen-Schranke sicher überschreitet. '.repeat(3)}</p>
          </div>
        </div>
      </div>
      <div class="inhalt padding-oben-80 einspaltig keindruck">
        <h2>Pressemitteilungen zum Thema</h2>
        <div class="daten"><h3 class="eintrag-titel"><a href="#">Verwandter Beitrag</a></h3></div>
      </div>
    </body></html>`;

    const extracted = await ContentExtractor.extractPageContent(
      'https://www.gruene-hessen.de/landtag/pressemitteilungen/beispiel/',
      sourceById('hessen-fraktion'),
      () => Promise.resolve(new Response(html))
    );

    expect(extracted.text).toContain('Ein hinreichend langer Artikeltext');
    expect(extracted.text).not.toContain('Verwandter Beitrag');
    expect(extracted.text).not.toContain('Pressemitteilungen zum Thema');
  });

  it('berlin-lv-beschluesse: eine kurze Seite fällt nicht auf body zurück (135 < 200 Zeichen)', async () => {
    const extracted = await ContentExtractor.extractPageContent(
      'https://gruene.berlin/beschluesse/ausserordentliche-flinta-vollversammlung_3565',
      berlinSource('berlin-lv-beschluesse'),
      fixtureFetch('gruene-berlin-beschluss-flinta-vollversammlung.html')
    );

    // Drei getrennte <p>-Elemente — die Blocktrennung (#3573) setzt einen
    // Trenner vor UND nach jedem Block, statt "Landesausschuss:Der"
    // zusammenzukleben. An JEDER der beiden Grenzen treffen ein "nach"- und
    // ein "vor"-Trenner aufeinander, macht durchgängig eine Leerzeile —
    // unabhängig von der Einrückung im Quelltext (die wird vor dem Einfügen
    // der eigenen Trenner zu einem einzelnen Leerzeichen kollabiert, Important
    // 1 aus dem Review).
    expect(extracted.text).toBe(
      '09.04.25 –\n\nBeschluss auf dem Landesausschuss:\n\nDer Landesausschuss beschließt, eine außerordentliche FLINTA-Vollversammlung einzuberufen.'
    );
    expect(extracted.text).not.toContain('Kontakt');
    expect(extracted.text).not.toContain('Kategorie');
    expect(extracted.text).not.toContain('Listenansicht');
    expect(extracted.text).not.toContain('Zurück');
    expect(extracted.bodyFallback).toBe(false);
  });

  it('bodyFallback ist true, wenn wirklich auf main/body zurückgefallen wird', async () => {
    const extracted = await ContentExtractor.extractPageContent(
      'https://gruene.berlin/x',
      { cms: 'typo3', contentSelectors: { title: [], date: [], content: [] } },
      fixtureFetch('gruene-berlin-beschluss-flinta-vollversammlung.html')
    );

    expect(extracted.bodyFallback).toBe(true);
    expect(extracted.text.length).toBeGreaterThan(0);
  });
});

/**
 * cheerio's `.text()` joins adjacent block elements without a separator, so
 * the last word of one block fuses with the first word of the next —
 * "prüfenDas", "ermöglichenDie", "ausDer", "IntroPara" (#3573). `blockText`
 * inserts a separator before AND after block elements and turns `<br>` into a
 * newline before reading the text. Inline elements (span, a, strong, em,
 * small) must NOT get a separator — that would split words apart instead
 * ("Grü nen", "inkl.MwSt"). `fullText` runs the same
 * `normalizeWhitespace(blockText(...))` pipeline every real caller uses, so
 * these tests see the actual stored shape, not `blockText`'s raw
 * (unnormalized, leading/trailing-newline) intermediate output.
 */
describe('ContentExtractor.blockText (#3573)', () => {
  function rawBlockText(html: string, selector = '#c'): string {
    const $ = cheerio.load(html);
    return ContentExtractor.blockText($, $(selector));
  }

  function fullText(html: string, selector = '#c'): string {
    return ContentExtractor.normalizeWhitespace(rawBlockText(html, selector));
  }

  it('trennt Geschwister-Blockelemente ohne Whitespace im Quelltext', () => {
    // Jede der beiden Grenzen bekommt einen "nach"-Trenner vom vorigen UND
    // einen "vor"-Trenner vom nächsten Block — daraus wird eine Leerzeile.
    expect(fullText('<div id="c"><h1>A</h1><h3>B</h3></div>')).toBe('A\n\nB');
  });

  it('ersetzt <br> durch einen Zeilenumbruch', () => {
    expect(fullText('<div id="c">A<br>B</div>')).toBe('A\nB');
  });

  it('fügt bei Inline-Elementen keinen Trenner ein (kein "Grü nen")', () => {
    expect(fullText('<p id="c">x <strong>fett</strong>y</p>')).toBe('x fetty');
  });

  it('small bleibt inline — kein Trenner, kein "inkl. MwSt" wird zu drei Zeilen (Minor 3)', () => {
    expect(fullText('<p id="c">Preis <small>inkl.</small>MwSt</p>')).toBe('Preis inkl.MwSt');
  });

  it('ein Quelltext-Zeilenumbruch INNERHALB eines Textknotens bleibt eine Zeile (Important 1)', () => {
    // Vorher: die Einrückung selbst wurde zum harten Trenner, `full_text` und
    // `content_hash` hingen an der Formatierung des Templates statt am Inhalt.
    expect(fullText('<p id="c">Lorem ipsum\n      dolor</p>')).toBe('Lorem ipsum dolor');
  });

  it('trennt Text, der VOR einem Blockelement steht (Important 2a)', () => {
    expect(fullText('<div id="c">Intro<p>Para</p></div>')).toBe('Intro\nPara');
  });

  it('trennt eine verschachtelte Liste, statt Elterntext mit Kindtext zu verkleben (Important 2a)', () => {
    expect(fullText('<li id="c">a<ul><li>b</li></ul></li>')).toBe('a\nb');
  });

  it('trennt mehrere vom Content-Selektor getroffene Geschwister-Wurzeln (Important 2b)', () => {
    // z. B. `.wp-block-paragraph` mit 2 Treffern auf derselben Ebene — jede
    // Wurzel landet für sich in `el`, keine gemeinsame Elternselektion.
    const $ = cheerio.load(
      '<div class="wrap"><p class="x">Satz eins.</p><p class="x">Satz zwei.</p></div>'
    );
    const text = ContentExtractor.normalizeWhitespace(ContentExtractor.blockText($, $('.x')));
    expect(text).toBe('Satz eins.\nSatz zwei.');
  });

  it('mutiert das freigegebene Dokument nicht (Datum bleibt für spätere Selektoren lesbar)', () => {
    const $ = cheerio.load(
      '<div><time id="date">2026-01-01</time><div id="c"><h1>A</h1><h3>B</h3></div></div>'
    );
    ContentExtractor.blockText($, $('#c'));
    expect($('#date').text()).toBe('2026-01-01');
    // Der Container selbst darf durch den Aufruf ebenfalls nicht verändert sein.
    expect($('#c').find('h1').length).toBe(1);
    expect($('#c').html()).toBe('<h1>A</h1><h3>B</h3>');
  });
});

/**
 * Regressionsfälle aus der LV-Datenqualitäts-Erhebung (#3573).
 */
describe('ContentExtractor — verklebte Blöcke aus der Praxis (#3573)', () => {
  it('sachsen-anhalt-fraktion (Neos): Titel und Anrisstext ohne Whitespace dazwischen bleiben getrennt', async () => {
    // Die reale Fixture __fixtures__/gruene-fraktion-sachsen-anhalt-reerdigung.html
    // hat zufällig einen Zeilenumbruch + Einrückung zwischen </h1> und dem
    // Anrisstext (Zeile 14/15) und reproduziert das Verkleben deshalb NICHT
    // mehr — die minifizierte Praxis-Seite aus der Erhebung hatte das nicht.
    // Diese Fixture bildet genau den minifizierten Fall nach (kein Whitespace
    // zwischen Tag-Ende und Anrisstext), wie ihn die Erhebung fand:
    // "Reerdigung per Gesetz ermöglichenDie Landtagsfraktion...".
    const html = `<!DOCTYPE html><html><body>
      <main>
      <div class="columns"><div class="columns__cell columns__cell--size-70">
        <h1>Reerdigung per Gesetz ermöglichen</h1>Die Landtagsfraktion Bündnis 90/Die Grünen fordert die Landesregierung auf, Reerdigung als Bestattungsform gesetzlich zu ermöglichen.
        <div class="neos-contentcollection"><div class="text"><p>${'Weiterer Fließtext, der die Zweihundert-Zeichen-Schranke sicher überschreitet. '.repeat(3)}</p></div></div>
      </div></div>
      </main>
    </body></html>`;

    const extracted = await ContentExtractor.extractPageContent(
      'https://gruene-fraktion-sachsen-anhalt.de/pressemitteilungen/reerdigung-per-gesetz-ermoeglichen',
      sourceById('sachsen-anhalt-fraktion'),
      () => Promise.resolve(new Response(html))
    );

    expect(extracted.text).not.toContain('ermöglichenDie');
    expect(extracted.text).toContain('ermöglichen\nDie Landtagsfraktion');
  });

  it('saarland-lv (WordPress): "Zoo aus<br />Der" bleibt getrennt', async () => {
    const html = `<!DOCTYPE html><html><body>
      <div class="entry-content">
        <p>${'Ein hinreichend langer Artikeltext, der die Zweihundert-Zeichen-Schranke sicher überschreitet. '.repeat(3)}</p>
        <p>Grüne Saar sprechen sich gegen Fuchsgehege im Neunkircher Zoo aus<br />Der Neunkircher Zoo plant eine Erweiterung.</p>
      </div>
    </body></html>`;

    const extracted = await ContentExtractor.extractPageContent(
      'https://gruene-saar.de/beispiel/',
      sourceById('saarland-lv'),
      () => Promise.resolve(new Response(html))
    );

    expect(extracted.text).not.toContain('Zoo ausDer');
    expect(extracted.text).toContain('Zoo aus\nDer Neunkircher Zoo');
  });
});

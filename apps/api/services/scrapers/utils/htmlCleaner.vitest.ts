import { describe, expect, it } from 'vitest';

import { segmentBlocks } from '../../document-services/TextChunker/blockSegmentation.js';
import { cleanTextForEmbedding } from '../../text/cleaning.js';

import { cleanText, htmlToStructuredText, normalizeStructuredText } from './htmlCleaner.js';

/**
 * Eine Seite in der Form, die die drei betroffenen Sammlungen liefern: ein
 * Vorspann ohne Überschrift, danach zwei `<h2>`-Abschnitte mit Absätzen und
 * einer Liste. Genau daran entscheidet sich, ob `chunkStructured`
 * (`TextChunker.ts:35`) den Struktur-Pfad nimmt oder den Fließtext-Schnellpfad.
 */
const SEITE = `
<div class="entry-content">
  <p>Die Fraktion hat ein Papier beschlossen. Es geht um die Waermewende und die Frage,
  wie Kommunen ihre Netze planen.</p>
  <h2>Waermeplanung</h2>
  <p>Die Kommunen brauchen Planungssicherheit. Wir wollen die Foerderung verstetigen und
  den Anschluss an Waermenetze erleichtern.</p>
  <ul><li>Foerderung verstetigen</li><li>Netze ausbauen</li></ul>
  <h2>Finanzierung</h2>
  <p>Der Bund traegt einen Teil der Kosten. Ohne Zuschuesse bleibt der Umbau fuer viele
  Haushalte unerreichbar.</p>
</div>`;

describe('normalizeStructuredText', () => {
  it('zieht [ \\t] zusammen, lässt \\n stehen und deckelt \\n{3,} auf \\n\\n', () => {
    expect(normalizeStructuredText('Zeile  eins\t\tnoch\n\n\n\nZeile zwei   ')).toBe(
      'Zeile eins noch\n\nZeile zwei'
    );
  });

  it('entfernt geschützte Leerzeichen und Nullbreiten-Zeichen, ohne Zeilen zu verlieren', () => {
    expect(normalizeStructuredText('Eins zwei​\ndrei')).toBe('Eins zwei\ndrei');
  });
});

describe('htmlToStructuredText', () => {
  it('macht aus h2 eine ##-Zeile und trennt Absätze durch eine Leerzeile', () => {
    const out = htmlToStructuredText('<h2>Titel</h2><p>Eins</p><p>Zwei</p>');

    expect(out).toBe('## Titel\n\nEins\n\nZwei');
    expect(out.split('\n').some((line) => line.startsWith('## '))).toBe(true);
  });

  it('macht <br> zu einem Zeilenumbruch', () => {
    expect(htmlToStructuredText('<p>Eins<br>Zwei</p>')).toBe('Eins\nZwei');
  });

  it('setzt für strong/em KEINE Sternchen — sie landeten sonst in der Einbettung', () => {
    expect(
      htmlToStructuredText('<p>Das ist <strong>wichtig</strong> und <em>kursiv</em>.</p>')
    ).toBe('Das ist wichtig und kursiv.');
  });

  it('verliert als Entity geschriebenes Markup nicht (replaceWith parst HTML)', () => {
    expect(htmlToStructuredText('<p>Vergleich &lt;b&gt;fett&lt;/b&gt; Ende</p><p>Zwei</p>')).toBe(
      'Vergleich <b>fett</b> Ende\n\nZwei'
    );
  });

  it('gibt für leere Eingabe eine leere Zeichenkette zurück', () => {
    expect(htmlToStructuredText('')).toBe('');
  });

  it('rendert Punkte einer geordneten Liste als `1) `, nicht `1. `', () => {
    const out = htmlToStructuredText('<ol><li>Eins</li><li>Zwei</li></ol>');

    expect(out).toBe('1) Eins\n2) Zwei');
  });

  it('lässt eine leere Überschrift keine nackte ##-Zeile hinterlassen', () => {
    expect(htmlToStructuredText('<h2></h2><p>Text.</p>')).toBe('Text.');
  });

  it("trennt Punkte verschachtelter Listen — `.find('li')` sammelte vorher auch die Nachfahren ein", () => {
    const html =
      '<h2>Titel</h2><ul><li>Eins<ul><li>Eins-a</li><li>Eins-b</li></ul></li><li>Zwei</li></ul>' +
      '<ol><li>Erst<ol><li>Erst-a</li></ol></li><li>Zweit</li></ol>';

    expect(htmlToStructuredText(html)).toBe(
      '## Titel\n\n- Eins\n- Eins-a\n- Eins-b\n- Zwei\n\n1) Erst\n1) Erst-a\n2) Zweit'
    );
  });

  it('nummeriert pro Liste neu — verschachteltes <ol> startet wieder bei 1, aussen ohne Lücke', () => {
    const html =
      '<ol><li>Erst<ol><li>Erst-a</li><li>Erst-b</li></ol></li><li>Zweit</li><li>Dritt</li></ol>';

    expect(htmlToStructuredText(html)).toBe('1) Erst\n1) Erst-a\n2) Erst-b\n2) Zweit\n3) Dritt');
  });

  it('behält das Präfix eines Punkts, der mit einer Unterliste BEGINNT (Review-Thread auf #3174)', () => {
    // Vorher: das führende `\n` der ersetzten Unterliste blieb stehen, das
    // Präfix wurde zu einem nackten `-` und "Zwei" hing an der Zeile darüber.
    const html = '<ul><li><ul><li>A</li><li>B</li></ul>Zwei</li><li>Drei</li></ul>';

    expect(htmlToStructuredText(html)).toBe('- Zwei\n- A\n- B\n- Drei');
  });

  it('trennt eigenen Text links und rechts einer Unterliste (Review-Thread auf #3174)', () => {
    // Ohne Leerzeichen im Quell-HTML rückten "A" und "B" nach dem Herauslösen
    // der Unterliste zu "AB" zusammen.
    const html = '<ul><li>A<ul><li>x</li></ul>B</li><li>C</li></ul>';

    expect(htmlToStructuredText(html)).toBe('- A B\n- x\n- C');
  });
});

/**
 * Die Reparatur zu Befund 1 (final-review.md): `1. Kurzer Punkt` liest
 * `NUMBERED_HEADING` (blockSegmentation.ts) als Überschrift der Ebene 1 und
 * löscht dabei den gesamten Stapel — ein echtes `<h2>` davor geht verloren,
 * das nächste `<h2>` hängt sich unter den Listenpunkt. `1) ` bricht die Regex
 * (sie verlangt `[.:]?` nach der Nummer, keine Klammer).
 */
describe('htmlToStructuredText erfindet keine Überschrift aus einem <ol>-Punkt (final-review.md, Befund 1)', () => {
  const SEITE_MIT_LISTE = `
    <h2>Waermeplanung</h2>
    <p>Die Kommunen brauchen Planungssicherheit fuer die naechsten Jahre.</p>
    <ol><li>Netze ausbauen</li><li>Foerderung sichern</li><li>Personal aufbauen</li></ol>
    <p>Deshalb schlagen wir ein Sofortprogramm vor, das die Kommunen entlastet.</p>
    <h2>Finanzierung</h2>
    <p>Der Bund traegt einen Teil der Kosten fuer den Umbau der Netze.</p>
  `;

  it('behält den echten headingPath nach der Liste — nie den Listenpunkt', () => {
    const blocks = segmentBlocks(
      cleanTextForEmbedding(htmlToStructuredText(SEITE_MIT_LISTE), true)
    );

    for (const block of blocks) {
      for (const heading of block.headingPath) {
        expect(heading).not.toMatch(/^\d/);
      }
    }

    const nachDerListe = blocks.filter((block) => block.text.includes('Sofortprogramm'));
    expect(nachDerListe.length).toBeGreaterThan(0);
    for (const block of nachDerListe) {
      expect(block.headingPath).toEqual(['Waermeplanung']);
    }

    const nachDerZweitenUeberschrift = blocks.filter((block) =>
      block.text.includes('traegt einen Teil')
    );
    expect(nachDerZweitenUeberschrift.length).toBeGreaterThan(0);
    for (const block of nachDerZweitenUeberschrift) {
      expect(block.headingPath).toEqual(['Waermeplanung', 'Finanzierung']);
    }
  });
});

/**
 * Die eigentliche Zusicherung: gemessen wird gegen den Chunker, nicht gegen
 * eine Zeichenkette. Ein künftiger `\s+`-Kollaps macht diesen Test rot; eine
 * Umformulierung des erzeugten Markdowns tut es nicht.
 */
describe('htmlToStructuredText erreicht den Struktur-Pfad des Chunkers (#3163)', () => {
  it('liefert mehr als einen Block und einen nicht-leeren headingPath', () => {
    const blocks = segmentBlocks(cleanTextForEmbedding(htmlToStructuredText(SEITE), true));

    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.some((block) => block.headingPath.length > 0)).toBe(true);
  });

  it('dieselbe Seite durch cleanText liefert genau einen Block ohne Pfad', () => {
    const flach = cleanText(htmlToStructuredText(SEITE));
    const blocks = segmentBlocks(cleanTextForEmbedding(flach, true));

    expect(blocks).toHaveLength(1);
    expect(blocks[0].headingPath).toEqual([]);
  });
});

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

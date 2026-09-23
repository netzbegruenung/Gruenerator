/**
 * Markdown-lite in Sharepic-Texten: `**fett**`, `_kursiv_`, `<u>unterstrichen</u>`.
 *
 * Der Parser entscheidet für Editor, Konva-Renderer, Server-Renderer und
 * KI-Sanitizer gemeinsam, was ein Marker ist — darum stehen die Grenzfälle
 * hier einmal und nicht viermal.
 */
import { describe, it, expect } from 'vitest';

import {
  hasInlineMarks,
  normalizeInlineMarks,
  parseInlineMarks,
  serializeInlineMarks,
  stripInlineMarks,
} from '@gruenerator/contracts';

const plain = (text: string) => ({ text, bold: false, italic: false, underline: false });

describe('parseInlineMarks', () => {
  it('liest Fett, Kursiv und Unterstrichen', () => {
    expect(parseInlineMarks('a **b** _c_ <u>d</u>')).toEqual([
      plain('a '),
      { text: 'b', bold: true, italic: false, underline: false },
      plain(' '),
      { text: 'c', bold: false, italic: true, underline: false },
      plain(' '),
      { text: 'd', bold: false, italic: false, underline: true },
    ]);
  });

  it('liest auch die Formen, die Modelle schreiben: __fett__ und *kursiv*', () => {
    expect(parseInlineMarks('__a__ *b*')).toEqual([
      { text: 'a', bold: true, italic: false, underline: false },
      plain(' '),
      { text: 'b', bold: false, italic: true, underline: false },
    ]);
  });

  it('verschachtelt Marks', () => {
    expect(parseInlineMarks('**a _b_ c**')).toEqual([
      { text: 'a ', bold: true, italic: false, underline: false },
      { text: 'b', bold: true, italic: true, underline: false },
      { text: ' c', bold: true, italic: false, underline: false },
    ]);
  });

  it('lässt Sternchen mit Leerraum dahinter literal — `2 * 3 * 4` ist eine Rechnung', () => {
    expect(parseInlineMarks('2 * 3 * 4')).toEqual([plain('2 * 3 * 4')]);
  });

  it('lässt einen Unterstrich mitten im Wort literal', () => {
    expect(parseInlineMarks('snake_case_name')).toEqual([plain('snake_case_name')]);
  });

  it('liest einen kursiven Wortanfang, den es selbst schreibt', () => {
    // `serializeInlineMarks` erzeugt für kursives „grün" vor „er" genau
    // `_grün_er`. Mit einer Wortgrenzen-Bedingung auch am schließenden Marker
    // ließ sich das nicht mehr lesen — die Runde drehte sich einmal und der
    // Kursivsatz war weg.
    expect(parseInlineMarks('_grün_er')).toEqual([
      { text: 'grün', bold: false, italic: true, underline: false },
      plain('er'),
    ]);
    expect(normalizeInlineMarks('*grün*er')).toBe('_grün_er');
    expect(normalizeInlineMarks('_grün_er')).toBe('_grün_er');
  });

  it('lässt einen ungepaarten Marker literal', () => {
    expect(parseInlineMarks('**offen')).toEqual([plain('**offen')]);
    expect(parseInlineMarks('a_b_')).toEqual([plain('a_b_')]);
  });

  it('macht beim Schließen alles literal, was darüber noch offen war', () => {
    expect(parseInlineMarks('**a _b** c')).toEqual([
      { text: 'a _b', bold: true, italic: false, underline: false },
      plain(' c'),
    ]);
  });

  it('liefert für eine leere Zeile keine Läufe', () => {
    expect(parseInlineMarks('')).toEqual([]);
  });
});

describe('serializeInlineMarks', () => {
  it('ist die Umkehrung des Parsers', () => {
    for (const line of ['a **b** _c_ <u>d</u>', '**a _b_ c**', 'nur Text', '**_<u>x</u>_**']) {
      expect(serializeInlineMarks(parseInlineMarks(line))).toBe(line);
    }
  });

  it('teilt sich ein Markerpaar über gleich ausgezeichnete Nachbarn', () => {
    // Nicht `**a **_**b**_` — das wäre beim nächsten Lesen kein Fett mehr,
    // weil der schließende Marker hinter einem Leerzeichen stünde.
    expect(
      serializeInlineMarks([
        { text: 'a ', bold: true, italic: false, underline: false },
        { text: 'b', bold: true, italic: true, underline: false },
      ])
    ).toBe('**a _b_**');
  });

  it('hält Leerraum an den Rändern eines Laufs außerhalb der Marker', () => {
    expect(
      serializeInlineMarks([
        plain('a'),
        { text: ' b ', bold: true, italic: false, underline: false },
        plain('c'),
      ])
    ).toBe('a **b** c');
  });
});

describe('normalizeInlineMarks', () => {
  it('bringt Modell-Schreibweisen in die eine Form', () => {
    expect(normalizeInlineMarks('__a__ und *b*')).toBe('**a** und _b_');
  });

  it('lässt Listenmarker am Zeilenanfang in Ruhe', () => {
    expect(normalizeInlineMarks('* Punkt eins\n* Punkt zwei')).toBe('* Punkt eins\n* Punkt zwei');
  });

  it('ist idempotent', () => {
    const once = normalizeInlineMarks('__a__ **b** *c* _d_ <u>e</u> f_g');
    expect(normalizeInlineMarks(once)).toBe(once);
  });
});

describe('stripInlineMarks / hasInlineMarks', () => {
  it('liefert nur den Text', () => {
    expect(stripInlineMarks('**a** _b_\n<u>c</u>')).toBe('a b\nc');
  });

  it('lässt literale Marker stehen', () => {
    expect(stripInlineMarks('2 * 3')).toBe('2 * 3');
  });

  it('erkennt, ob überhaupt etwas ausgezeichnet ist', () => {
    expect(hasInlineMarks('nur Text')).toBe(false);
    expect(hasInlineMarks('2 * 3 * 4')).toBe(false);
    expect(hasInlineMarks('a\n**b**')).toBe(true);
  });
});

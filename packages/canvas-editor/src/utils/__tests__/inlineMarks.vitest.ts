/**
 * Markdown-lite in Sharepic-Texten: `**fett**`, `_kursiv_`, `<u>unterstrichen</u>`,
 * `==Akzent==`.
 *
 * Der Parser entscheidet für Editor, Konva-Renderer, Server-Renderer und
 * KI-Sanitizer gemeinsam, was ein Marker ist — darum stehen die Grenzfälle
 * hier einmal und nicht viermal.
 */
import { describe, it, expect } from 'vitest';

import {
  foldMarkerIntoAccent,
  hasInlineMarks,
  normalizeInlineMarks,
  parseInlineMarks,
  serializeInlineMarks,
  stripInlineMarks,
} from '@gruenerator/contracts';

const plain = (text: string) => ({
  text,
  bold: false,
  italic: false,
  underline: false,
  accent: false,
  marker: false,
});

describe('parseInlineMarks', () => {
  it('liest Fett, Kursiv und Unterstrichen', () => {
    expect(parseInlineMarks('a **b** _c_ <u>d</u>')).toEqual([
      plain('a '),
      { text: 'b', bold: true, italic: false, underline: false, accent: false, marker: false },
      plain(' '),
      { text: 'c', bold: false, italic: true, underline: false, accent: false, marker: false },
      plain(' '),
      { text: 'd', bold: false, italic: false, underline: true, accent: false, marker: false },
    ]);
  });

  it('liest auch die Formen, die Modelle schreiben: __fett__ und *kursiv*', () => {
    expect(parseInlineMarks('__a__ *b*')).toEqual([
      { text: 'a', bold: true, italic: false, underline: false, accent: false, marker: false },
      plain(' '),
      { text: 'b', bold: false, italic: true, underline: false, accent: false, marker: false },
    ]);
  });

  it('verschachtelt Marks', () => {
    expect(parseInlineMarks('**a _b_ c**')).toEqual([
      { text: 'a ', bold: true, italic: false, underline: false, accent: false, marker: false },
      { text: 'b', bold: true, italic: true, underline: false, accent: false, marker: false },
      { text: ' c', bold: true, italic: false, underline: false, accent: false, marker: false },
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
      { text: 'grün', bold: false, italic: true, underline: false, accent: false, marker: false },
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
      { text: 'a _b', bold: true, italic: false, underline: false, accent: false, marker: false },
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
        { text: 'a ', bold: true, italic: false, underline: false, accent: false, marker: false },
        { text: 'b', bold: true, italic: true, underline: false, accent: false, marker: false },
      ])
    ).toBe('**a _b_**');
  });

  it('hält Leerraum an den Rändern eines Laufs außerhalb der Marker', () => {
    expect(
      serializeInlineMarks([
        plain('a'),
        { text: ' b ', bold: true, italic: false, underline: false, accent: false, marker: false },
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

describe('Akzent ==…==', () => {
  it('liest ein Akzentwort mitten in der Zeile', () => {
    expect(parseInlineMarks('Vermögen ist ==ungleich== verteilt')).toEqual([
      plain('Vermögen ist '),
      {
        text: 'ungleich',
        bold: false,
        italic: false,
        underline: false,
        accent: true,
        marker: false,
      },
      plain(' verteilt'),
    ]);
    expect(hasInlineMarks('a ==b==')).toBe(true);
    expect(stripInlineMarks('a ==b c==')).toBe('a b c');
  });

  it('bleibt beim Serialisieren erhalten, auch mit Fett darin', () => {
    expect(normalizeInlineMarks('==keinen **Cent**==')).toBe('==keinen **Cent**==');
    expect(serializeInlineMarks(parseInlineMarks('x ==y== z'))).toBe('x ==y== z');
  });

  it('lässt Vergleiche und ungepaarte Marker literal', () => {
    expect(stripInlineMarks('a == b')).toBe('a == b');
    expect(hasInlineMarks('x ==y')).toBe(false);
  });
});

describe('Marker ++…++', () => {
  it('liest eine Passage mitten in der Zeile', () => {
    expect(parseInlineMarks('Das ist ++ein ganzer Satz++ hier')).toEqual([
      plain('Das ist '),
      {
        text: 'ein ganzer Satz',
        bold: false,
        italic: false,
        underline: false,
        accent: false,
        marker: true,
      },
      plain(' hier'),
    ]);
    expect(hasInlineMarks('a ++b++')).toBe(true);
    expect(stripInlineMarks('a ++b c++')).toBe('a b c');
  });

  it('bleibt beim Serialisieren erhalten, neben Akzent und Fett', () => {
    expect(normalizeInlineMarks('x ++y++ z')).toBe('x ++y++ z');
    expect(normalizeInlineMarks('++keinen **Cent**++')).toBe('++keinen **Cent**++');
    expect(normalizeInlineMarks('++a ==b== c++')).toBe('++a ==b== c++');
    const once = normalizeInlineMarks('==a ++b++ c==');
    expect(normalizeInlineMarks(once)).toBe(once);
    expect(stripInlineMarks(once)).toBe('a b c');
  });

  it('lässt C++, Plus-Ketten und ungepaarte Marker literal', () => {
    expect(stripInlineMarks('Ich mag C++ und C++ sehr')).toBe('Ich mag C++ und C++ sehr');
    expect(hasInlineMarks('x ++y')).toBe(false);
    expect(hasInlineMarks('1 + 1 = 2')).toBe(false);
  });

  it('kollidiert nicht mit […]-Kürzungen und Listenmarkern', () => {
    expect(stripInlineMarks('Wir […] bauen ++Wohnungen[…]++')).toBe('Wir […] bauen Wohnungen[…]');
    expect(parseInlineMarks('+ Punkt')).toEqual([plain('+ Punkt')]);
  });
});

describe('Marker ++ ist wortgebunden (wie _)', () => {
  it.each([
    ['C++, Java und C++', 'C++, Java und C++'],
    ['C++-Code in C++.', 'C++-Code in C++.'],
    ['1++2++3', '1++2++3'],
  ])('lässt %s unberührt', (text, shown) => {
    expect(stripInlineMarks(text)).toBe(shown);
    expect(hasInlineMarks(text)).toBe(false);
    expect(foldMarkerIntoAccent(text)).toBe(text);
  });

  it('öffnet nach Satzzeichen und Leerraum, schließt auch am Wort (Wortanfang)', () => {
    expect(stripInlineMarks('(++Wohnungen++)')).toBe('(Wohnungen)');
    expect(stripInlineMarks('++grün++er')).toBe('grüner');
  });

  it('AT: ++ wird zum Akzent, C++ bleibt Text', () => {
    expect(foldMarkerIntoAccent('Wir ++bauen++ in C++, Java und C++')).toBe(
      'Wir ==bauen== in C++, Java und C++'
    );
  });
});

describe('Passagenfarbe =={#RRGGBB}…== und ++{#RRGGBB}…++', () => {
  it('liest die Farbe am öffnenden Marker, in Großbuchstaben', () => {
    expect(parseInlineMarks('Sonne für =={#e6007e}alle==')).toEqual([
      plain('Sonne für '),
      { ...plain('alle'), accent: true, accentColor: '#E6007E' },
    ]);
    expect(parseInlineMarks('++{#FFFFFF}vom Dach++')).toEqual([
      { ...plain('vom Dach'), marker: true, markerColor: '#FFFFFF' },
    ]);
  });

  it('schreibt sie kanonisch zurück', () => {
    for (const text of ['=={#E6007E}alle== und ++{#77F6A5}Dach++', '++{#FFFFFF}=={#123ABC}a==++']) {
      expect(normalizeInlineMarks(text)).toBe(text);
    }
  });

  it('verschmilzt Nachbarn nur bei gleicher Farbe', () => {
    const runs = parseInlineMarks('=={#E6007E}rot===={#00FF00}grün==');
    expect(runs.map((run) => run.accentColor)).toEqual(['#E6007E', '#00FF00']);
    expect(serializeInlineMarks(runs)).toBe('=={#E6007E}rot===={#00FF00}grün==');
    expect(serializeInlineMarks(parseInlineMarks('==a====b=='))).toBe('==ab==');
  });

  it('ohne Zusatz bleibt alles wie bisher', () => {
    const [run] = parseInlineMarks('==alle==');
    expect(run).not.toHaveProperty('accentColor');
    expect(normalizeInlineMarks('==alle== ++Dach++')).toBe('==alle== ++Dach++');
  });

  it.each([
    ['=={#GGGGGG}a==', '{#GGGGGG}a'],
    ['=={#FFF}a==', '{#FFF}a'],
    ['==a=={#FFFFFF}', 'a{#FFFFFF}'],
  ])('ein ungültiger oder schließender Zusatz ist Text: %s', (text, shown) => {
    expect(stripInlineMarks(text)).toBe(shown);
  });

  it('ein ungepaarter farbiger Marker bleibt literal samt Zusatz', () => {
    expect(stripInlineMarks('=={#E6007E}offen')).toBe('=={#E6007E}offen');
  });

  it('AT: die Kastenfarbe wird nicht zur Schriftfarbe', () => {
    expect(foldMarkerIntoAccent('++{#FFFFFF}bauen++')).toBe('==bauen==');
  });
});

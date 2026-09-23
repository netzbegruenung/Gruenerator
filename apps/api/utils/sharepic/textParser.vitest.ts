import { describe, it, expect } from 'vitest';

import {
  isAttributionLine,
  parseLabeledText,
  truncateAtSentence,
  truncateField,
  sanitizeField,
} from './textParser.js';

describe('truncateField', () => {
  it('returns the value unchanged when within the limit', () => {
    expect(truncateField('short text', 50)).toBe('short text');
  });

  it('trims at a word boundary when one is reasonably close', () => {
    const value = 'one two three four five six seven eight';
    const result = truncateField(value, 20);
    expect(result.length).toBeLessThanOrEqual(20);
    // Should not end mid-word.
    expect(value.startsWith(result)).toBe(true);
    expect(result.endsWith(' ')).toBe(false);
  });
});

describe('truncateAtSentence', () => {
  it('returns the value unchanged when within the limit', () => {
    const value = 'Ein kurzer Satz.';
    expect(truncateAtSentence(value, 100)).toBe(value);
  });

  it('cuts at the last sentence boundary within the limit (never mid-sentence)', () => {
    const value =
      'Der Rückgang der Biodiversität ist Realität. Bienen verschwinden aus unseren Feldern. Wir brauchen jetzt mehr Artenschutz und Handlungsdruck.';
    const result = truncateAtSentence(value, 90);
    expect(result.length).toBeLessThanOrEqual(90);
    // Ends on a complete sentence and never leaves a dangling next sentence.
    expect(/[.!?]$/.test(result)).toBe(true);
    expect(result.endsWith('Feldern.')).toBe(true);
    expect(result).not.toContain('Wir brauchen');
    expect(value.startsWith(result)).toBe(true);
  });

  it('handles ! and ? as sentence terminators', () => {
    const value = 'Schützt die Natur! Warum warten wir noch? Jetzt handeln und nicht später.';
    const result = truncateAtSentence(value, 30);
    expect(/[.!?]$/.test(result)).toBe(true);
    expect(result).toBe('Schützt die Natur!');
  });

  it('falls back to word-boundary truncation when no sentence break fits', () => {
    // A single long run with the only period far past the limit.
    const value = 'wort '.repeat(40) + 'ende.';
    const result = truncateAtSentence(value, 30);
    expect(result.length).toBeLessThanOrEqual(30);
    expect(/[.!?]$/.test(result)).toBe(false);
    expect(value.startsWith(result)).toBe(true);
  });
});

describe('parseLabeledText — attribution lines never enter a field', () => {
  it('drops the fabricated source line the Kickl sharepic shipped', () => {
    // Live bug: zitat_pure declares only a ZITAT label, so every following line
    // was appended to the quote — including an invented "ORF-Interview" source
    // that the template has no field for and that read as a real citation.
    const raw = [
      'ZITAT: "Ich verachte den Rechtsstaat."',
      '— Herbert Kickl, ORF-Interview, 3.3.2026',
    ].join('\n');
    const result = parseLabeledText(raw, ['zitat']);
    expect(result.success).toBe(true);
    expect(result.data['zitat']).toBe('"Ich verachte den Rechtsstaat."');
    expect(result.data['zitat']).not.toContain('ORF');
    expect(result.data['zitat']).not.toContain('Kickl');
  });

  it('drops an explicit Quelle: line', () => {
    const raw = 'ZITAT: Klimaschutz ist Menschenschutz.\nQuelle: Umweltbundesamt 2026';
    const result = parseLabeledText(raw, ['zitat']);
    expect(result.data['zitat']).toBe('Klimaschutz ist Menschenschutz.');
  });

  it('keeps a genuine multi-line quote intact', () => {
    const raw = [
      'ZITAT: Wir haben es in der Hand.',
      'Jede Tonne CO2 zählt, und jede Entscheidung auch.',
    ].join('\n');
    const result = parseLabeledText(raw, ['zitat']);
    expect(result.data['zitat']).toBe(
      'Wir haben es in der Hand.\nJede Tonne CO2 zählt, und jede Entscheidung auch.'
    );
  });
});

describe('isAttributionLine', () => {
  it('matches attribution shapes', () => {
    for (const line of [
      '— Herbert Kickl, ORF-Interview, 3.3.2026',
      '– Studie des Umweltbundesamts, 2026',
      'Quelle: ORF',
      '(Quelle: Der Standard, 2026)',
      'Foto: Anna Muster',
    ]) {
      expect(isAttributionLine(line), line).toBe(true);
    }
  });

  it('does not match ordinary content', () => {
    for (const line of [
      'Jede Tonne CO2 zählt, und jede Entscheidung auch.',
      'Wir handeln jetzt.',
      '— und genau deshalb brauchen wir endlich eine echte Verkehrswende in diesem Land',
      'Klimaschutz, Gerechtigkeit und Demokratie gehören zusammen, das ist unser Kompass.',
    ]) {
      expect(isAttributionLine(line), line).toBe(false);
    }
  });
});

/**
 * `sanitizeField` schmolz mit `\s+ → ' '` jeden Zeilenumbruch ein. Das war der
 * Grund, warum KEIN KI-generierter Sharepic-Text je eine Aufzählung tragen
 * konnte: der Parser sammelt mehrzeilige Werte korrekt ein, und diese eine
 * Zeile warf sie direkt danach wieder weg.
 */
describe('sanitizeField', () => {
  it('schmilzt ohne Optionen weiterhin alles zu einer Zeile und streicht Marker', () => {
    expect(sanitizeField('• eins\n• zwei')).toBe('• eins • zwei');
    expect(sanitizeField('**fett** und _kursiv_')).toBe('fett und kursiv');
  });

  it('behält den Umbruch vor einer Aufzählungszeile', () => {
    expect(sanitizeField('• eins\n• zwei', { keepListBreaks: true, keepMarks: true })).toBe(
      '• eins\n• zwei'
    );
  });

  it('vereinheitlicht Strich-Marker auf das Bullet', () => {
    // `* zwei` ist ein Listenpunkt, kein halber Kursiv-Marker — die
    // Listen-Normalisierung muss vor der Inline-Normalisierung laufen.
    expect(sanitizeField('- eins\n* zwei', { keepListBreaks: true, keepMarks: true })).toBe(
      '• eins\n• zwei'
    );
  });

  it('schmilzt einen Umbruch mitten im Fließtext weiterhin ein', () => {
    // Ein Modell, das seine Prosa auf 80 Zeichen umbricht, soll zu einem
    // Absatz zusammenlaufen — sonst stünden harte Umbrüche mitten im Satz.
    expect(
      sanitizeField('Wir wollen mehr\nRadwege bauen.', { keepListBreaks: true, keepMarks: true })
    ).toBe('Wir wollen mehr Radwege bauen.');
  });

  it('hält eine einzelne Ziffernzeile für ein Datum, nicht für eine Aufzählung', () => {
    expect(
      sanitizeField('Kundgebung am\n1. Mai 2027', { keepListBreaks: true, keepMarks: true })
    ).toBe('Kundgebung am 1. Mai 2027');
  });

  it('behält Auszeichnung und bringt sie in die eine Form', () => {
    // `__fett__` und `*kursiv*` schreiben Modelle ebenfalls; der Editor
    // zeichnet nur `**fett**` und `_kursiv_`.
    expect(
      sanitizeField('__fett__ und *kursiv* und <u>unter</u>', {
        keepListBreaks: true,
        keepMarks: true,
      })
    ).toBe('**fett** und _kursiv_ und <u>unter</u>');
  });

  it('streicht Hashtags weiterhin, auch mit Auszeichnung daneben', () => {
    expect(sanitizeField('**Klima** jetzt #gruen', { keepListBreaks: true, keepMarks: true })).toBe(
      '**Klima** jetzt'
    );
  });

  it('streicht einen Hashtag INNERHALB der Auszeichnung, ohne den Marker zu zerreißen', () => {
    // Liefe der Hashtag-Strip nach der Normalisierung, bliebe `**Klima **`
    // stehen: ein öffnender Marker ohne Partner, literal auf der Leinwand.
    expect(
      sanitizeField('**Klima #jetzt** ist gut', { keepListBreaks: true, keepMarks: true })
    ).toBe('**Klima** ist gut');
  });

  it('streicht Auszeichnung in einem mehrzeiligen Feld ohne keepMarks', () => {
    // Veranstaltungsbeschreibung und Simple-Unterzeile laufen in
    // GrueneTypeNeue: Aufzählung ja, Fett nein.
    expect(sanitizeField('• **eins**\n• zwei', { keepListBreaks: true })).toBe('• eins\n• zwei');
  });
});

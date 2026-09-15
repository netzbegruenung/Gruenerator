/**
 * Umbruch, Aufzählungsmarker und hängender Einzug.
 *
 * Gemessen wird mit einer festen Attrappe (ein Zeichen = 10 px), damit die
 * Zusicherungen deterministisch sind und kein Canvas brauchen — genau dafür
 * nimmt `listLayout` die Messung als Callback entgegen.
 */
import { describe, it, expect } from 'vitest';

import {
  hasListMarkers,
  layoutTextBlock,
  normalizeListMarkers,
  splitListItems,
  wrapLines,
} from '@gruenerator/contracts';

/** Ein Zeichen = 10 px. */
const measure = (text: string) => text.length * 10;

describe('wrapLines', () => {
  it('bricht an einem harten Zeilenumbruch, auch wenn die Zeile passen würde', () => {
    // Der eigentliche Fehler: die alte Fassung splittete nur an ' ' und
    // meldete hier EINE Zeile. Die Auto-Fit-Schleifen der Vorlagen hingen
    // daran und verkleinerten deshalb nie.
    expect(wrapLines('a\nb\nc', 1000, measure)).toEqual(['a', 'b', 'c']);
  });

  it('bricht weiterhin an Wortgrenzen', () => {
    expect(wrapLines('aaa bbb ccc', 70, measure)).toEqual(['aaa bbb', 'ccc']);
  });

  it('bricht ein Wort, das allein zu breit ist, innerhalb des Wortes', () => {
    // Ohne diesen Zweig liefe die Zeile über: die vorberechneten Zeilen werden
    // mit wrap="none" gesetzt, Konvas eigenes Netz greift dann nicht mehr.
    expect(wrapLines('aaaaaa', 30, measure)).toEqual(['aaa', 'aaa']);
  });

  it('erhält eine Leerzeile', () => {
    expect(wrapLines('a\n\nb', 1000, measure)).toEqual(['a', '', 'b']);
  });
});

describe('splitListItems', () => {
  it('erkennt Bullet- und Strich-Marker', () => {
    expect(splitListItems('• eins\n- zwei\n* drei\n– vier').map((i) => i.marker)).toEqual([
      '•',
      '-',
      '*',
      '–',
    ]);
  });

  it('trennt den Marker vom Text ab', () => {
    expect(splitListItems('• Windkraft ausbauen')[0]).toEqual({
      marker: '•',
      body: 'Windkraft ausbauen',
    });
  });

  it('hält eine einzelne Ziffernzeile für ein Datum, nicht für eine Aufzählung', () => {
    // "1. Mai Demo" in einem Veranstaltungsfeld darf nicht eingerückt werden.
    expect(splitListItems('1. Mai Demo')[0]!.marker).toBeNull();
  });

  it('erkennt Ziffern als Marker, sobald zwei Zeilen welche tragen', () => {
    expect(splitListItems('1. eins\n2. zwei').map((i) => i.marker)).toEqual(['1.', '2.']);
  });

  it('lässt gewöhnliche Zeilen neben Markerzeilen stehen', () => {
    expect(splitListItems('Unsere Ziele:\n• eins').map((i) => i.marker)).toEqual([null, '•']);
  });
});

describe('normalizeListMarkers', () => {
  it('vereinheitlicht Strich-Marker auf das Bullet', () => {
    expect(normalizeListMarkers('- eins\n* zwei\n– drei')).toBe('• eins\n• zwei\n• drei');
  });

  it('lässt nummerierte Punkte in Ruhe — ihre Reihenfolge ist Information', () => {
    expect(normalizeListMarkers('1. eins\n2. zwei')).toBe('1. eins\n2. zwei');
  });

  it('fasst einen Bindestrich mitten im Satz nicht an', () => {
    expect(normalizeListMarkers('Kosten-Nutzen-Analyse')).toBe('Kosten-Nutzen-Analyse');
  });
});

describe('layoutTextBlock', () => {
  it('gibt ohne Marker schlichte Zeilen ohne Einzug', () => {
    expect(layoutTextBlock('abc def', 1000, measure)).toEqual([
      { text: 'abc def', indent: 0, marker: null },
    ]);
  });

  it('setzt den Marker nur auf die erste Zeile eines Punktes', () => {
    // "• " misst 20 px, es bleiben 80 px für den Text: "aaa bbb ccc" (110 px)
    // bricht also in zwei Zeilen, und nur die erste trägt den Marker.
    const lines = layoutTextBlock('• aaa bbb ccc', 100, measure);
    expect(lines.map((l) => l.marker)).toEqual(['•', null]);
  });

  it('gibt der Fortsetzungszeile denselben Einzug wie der ersten', () => {
    // Das ist der hängende Einzug: ohne ihn springt die zweite Zeile auf
    // Spalte 0 zurück und liest sich wie ein neuer Punkt.
    const lines = layoutTextBlock('• aaa bbb ccc', 100, measure);
    expect(lines.map((l) => l.indent)).toEqual([20, 20]);
  });

  it('rückt alle Punkte gleich weit ein, auch bei ungleich breiten Markern', () => {
    const lines = layoutTextBlock('9. eins\n10. zwei', 1000, measure);
    expect(new Set(lines.map((l) => l.indent)).size).toBe(1);
  });

  it('lässt eine gewöhnliche Zeile neben einer Liste unangetastet am Rand', () => {
    const lines = layoutTextBlock('Ziele:\n• eins', 1000, measure);
    expect(lines.map((l) => l.indent)).toEqual([0, 20]);
  });

  it('zählt eine sechszeilige Aufzählung als sechs Zeilen', () => {
    const body = ['• eins', '• zwei', '• drei', '• vier', '• fuenf', '• sechs'].join('\n');
    expect(layoutTextBlock(body, 1000, measure)).toHaveLength(6);
  });
});

describe('hasListMarkers', () => {
  it('erkennt eine Liste', () => {
    expect(hasListMarkers('• eins\n• zwei')).toBe(true);
  });

  it('meldet für Fließtext nichts', () => {
    expect(hasListMarkers('Ein gewöhnlicher Satz.')).toBe(false);
  });
});

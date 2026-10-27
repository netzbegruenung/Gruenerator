// SPDX-License-Identifier: MPL-2.0
/**
 * Die Kästen eines ++Marker++-Textes: ein Stück je Zeile, an der gemessenen
 * Stelle. Attrappe: ein Zeichen = 10 px.
 */
import { layoutRichTextBlock, type MeasureRun } from '@ggraphic/schema';
import { describe, it, expect } from 'vitest';

import { markerBoxes } from '@ggraphic/editor/utils/markerBoxes';

const measure: MeasureRun = (text) => text.length * 10;
const marker = { fill: '#FFFFFF', color: '#1D3557', padX: 0.2, padY: 0 };
const opts = { fontSize: 20, lineHeightPx: 24, top: 5, originX: [0, 0, 0, 0] };

describe('markerBoxes', () => {
  it('legt einen Kasten hinter die Passage, ohne das Leerzeichen dahinter', () => {
    const lines = layoutRichTextBlock('ab ++cd ef++ gh', 1000, measure);
    const boxes = markerBoxes(lines, measure, marker, opts);
    expect(boxes).toHaveLength(1);
    // "ab " = 30 px, "cd ef" = 50 px; neben einem Wort höchstens 0.3 des
    // Leerzeichens (3 px) statt des Innenabstands 0.2 * 20 = 4 px.
    expect(boxes[0]).toMatchObject({ line: 0, x: 30 - 3, width: 50 + 6 });
  });

  it('lässt den Großteil des Leerzeichens zum Nachbarwort frei', () => {
    const lines = layoutRichTextBlock('ab ++cd++ ef', 1000, measure);
    const [box] = markerBoxes(lines, measure, { ...marker, padX: 1 }, opts);
    // Leerzeichen je 10 px: links bleiben 7 px bis "ab", rechts 7 px bis "ef".
    expect(box!.x - 20).toBe(7);
    expect(60 - (box!.x + box!.width)).toBe(7);
  });

  it('bricht mit der Passage um: ein Kasten je Zeilenstück', () => {
    // 80 px = 8 Zeichen: die Passage "cd ef gh" läuft über den Umbruch.
    const lines = layoutRichTextBlock('ab ++cd ef gh++ ij', 80, measure);
    expect(lines.map((l) => l.runs.map((r) => r.text).join(''))).toEqual(['ab cd ef', 'gh ij']);
    const boxes = markerBoxes(lines, measure, marker, { ...opts, lineHeightPx: 24 });
    expect(boxes.map((b) => b.line)).toEqual([0, 1]);
    // Zeile 0: von "cd" (x 30, neben "ab") bis Zeilenende "ef" (Leerzeichen am Umbruch bleibt draußen).
    expect(boxes[0]).toMatchObject({ x: 30 - 3, width: 50 + 3 + 4 });
    // Zeile 1: "gh" von x 0, ein Zeichenpaar breit — "ij" ist nicht markiert.
    expect(boxes[1]).toMatchObject({ x: 0 - 4, width: 20 + 4 + 3 });
    // Zeile 1 liegt genau eine Zeilenhöhe tiefer.
    expect(boxes[1]!.y - boxes[0]!.y).toBe(24);
  });

  it('folgt der Ausrichtung und dem Einzug jeder Zeile', () => {
    const lines = layoutRichTextBlock('++ab++', 1000, measure);
    const [box] = markerBoxes(lines, measure, marker, { ...opts, originX: [100] });
    expect(box!.x).toBe(100 - 4);
  });

  it('fasst benachbarte markierte Läufe (etwa fett darin) zu einem Kasten', () => {
    const lines = layoutRichTextBlock('++ab **cd** ef++', 1000, measure);
    expect(markerBoxes(lines, measure, marker, opts)).toHaveLength(1);
  });

  it('liefert nichts ohne Markerlauf und nie höher als die Zeile', () => {
    expect(markerBoxes(layoutRichTextBlock('ab cd', 1000, measure), measure, marker, opts)).toEqual(
      []
    );
    const [box] = markerBoxes(layoutRichTextBlock('++ab++', 1000, measure), measure, marker, {
      ...opts,
      fontSize: 40,
    });
    expect(box!.height).toBeLessThanOrEqual(24);
  });

  it('färbt jeden Kasten mit seiner Passagenfarbe, mit lesbarer Schrift darin', () => {
    const lines = layoutRichTextBlock('++a++ ++{#1D3557}bc++ ++{#9EE493}de++', 1000, measure);
    const boxes = markerBoxes(lines, measure, marker, opts);
    expect(boxes.map((b) => [b.fill, b.ink])).toEqual([
      ['#FFFFFF', '#1D3557'],
      ['#1D3557', '#FFFFFF'],
      ['#9EE493', '#1D3557'],
    ]);
  });

  it('trennt direkt aneinanderstoßende Passagen verschiedener Farbe', () => {
    const lines = layoutRichTextBlock('++{#FFFFFF}ab++++{#9EE493}cd++', 1000, measure);
    const boxes = markerBoxes(lines, measure, marker, opts);
    expect(boxes.map((b) => [b.x + 4, b.width - 8, b.fill])).toEqual([
      [0, 20, '#FFFFFF'],
      [20, 20, '#9EE493'],
    ]);
  });
});

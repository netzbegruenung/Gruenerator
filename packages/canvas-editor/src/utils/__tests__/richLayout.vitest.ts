/**
 * Umbruch mit Stil je Wort: ein fettes Wort ist breiter, und der Umbruch muss
 * das wissen — sonst bricht die Vorschau an einer anderen Stelle um als der
 * Renderer, der die Läufe dann tatsächlich fett zeichnet.
 *
 * Attrappe: ein Zeichen = 10 px, fett = 12 px.
 */
import { describe, it, expect } from 'vitest';

import { layoutRichTextBlock, layoutTextBlock, wrapLines } from '@gruenerator/contracts';

import type { MeasureRun, RunStyle } from '@gruenerator/contracts';

const measure: MeasureRun = (text, style) => text.length * (style.bold ? 12 : 10);
const plain: RunStyle = { bold: false, italic: false, underline: false };
const bold: RunStyle = { bold: true, italic: false, underline: false };

describe('layoutRichTextBlock', () => {
  it('liefert Läufe mit Position, Leerzeichen im Stil des Wortes davor', () => {
    const [line] = layoutRichTextBlock('a **bb** c', 1000, measure);
    expect(line?.runs).toEqual([
      { text: 'a ', ...plain, x: 0 },
      { text: 'bb ', ...bold, x: 20 },
      { text: 'c', ...plain, x: 20 + 36 },
    ]);
  });

  it('bricht ein fettes Wort früher um als dasselbe Wort regular', () => {
    // "aaa bbb" = 30 + 10 + 30 = 70 passt regular in 70 px …
    expect(wrapLines('aaa bbb', 70, (t) => measure(t, plain))).toEqual(['aaa bbb']);
    // … fett wird "bbb" 36 px breit, und die Zeile ist 76 px: Umbruch.
    const lines = layoutRichTextBlock('aaa **bbb**', 70, measure);
    expect(lines.map((l) => l.runs.map((r) => r.text).join(''))).toEqual(['aaa', 'bbb']);
  });

  it('bricht ein zu breites Wort innerhalb des Wortes, auch über einen Markerwechsel', () => {
    const lines = layoutRichTextBlock('**ab**cd', 25, measure);
    expect(lines.map((l) => l.runs)).toEqual([
      [{ text: 'ab', ...bold, x: 0 }],
      [{ text: 'cd', ...plain, x: 0 }],
    ]);
  });

  it('zieht den Unterstrich nur dann unter ein Leerzeichen, wenn beide Nachbarn unterstrichen sind', () => {
    const underline: RunStyle = { bold: false, italic: false, underline: true };
    const [a] = layoutRichTextBlock('<u>ab cd</u> ef', 1000, measure);
    expect(a?.runs).toEqual([
      { text: 'ab cd', ...underline, x: 0 },
      { text: ' ef', ...plain, x: 50 },
    ]);
  });

  it('setzt Marker, Einzug und Läufe zusammen', () => {
    const lines = layoutRichTextBlock('• **a** b\n• c', 1000, measure);
    expect(lines).toEqual([
      {
        marker: '•',
        indent: 20,
        runs: [
          { text: 'a ', ...bold, x: 0 },
          { text: 'b', ...plain, x: 24 },
        ],
      },
      { marker: '•', indent: 20, runs: [{ text: 'c', ...plain, x: 0 }] },
    ]);
  });
});

describe('layoutTextBlock / wrapLines mit Auszeichnung', () => {
  it('zählt für ausgezeichneten Text dieselben Zeilen wie die Lauf-Variante', () => {
    const text = 'aaa **bbb** ccc\n• _ddd_ eee';
    const rich = layoutRichTextBlock(text, 90, measure).length;
    const flat = layoutTextBlock(text, 90, (t) => measure(t, plain)).length;
    // Mit einem stil-blinden Maß ist Fett nicht breiter — die Zeilenzahl
    // stimmt hier überein, weil nichts an der Grenze liegt.
    expect(flat).toBe(rich);
  });

  it('liefert Zeilen ohne Auszeichnungsmarker', () => {
    expect(wrapLines('a **b** _c_', 1000, (t) => measure(t, plain))).toEqual(['a b c']);
    expect(layoutTextBlock('• **x**', 1000, (t) => measure(t, plain))).toEqual([
      { text: 'x', indent: 20, marker: '•' },
    ]);
  });
});

import { describe, it, expect } from 'vitest';

import { renderText } from './textRenderer.js';

import type { TextLayer } from '../types/freeCanvasTypes.js';
import type { SKRSContext2D } from '@napi-rs/canvas';

/**
 * Ein Aufzählungszeichen gehört an den linken Rand des Blocks, der Text um den
 * Einzug nach rechts — und die FOLGEZEILEN eines Punktes stehen bündig unter
 * seinem Text, nicht unter dem Zeichen. Genau das ist der hängende Einzug.
 *
 * Der erste Anlauf zeichnete Marker und Text als EINEN String an `x + indent`.
 * Damit saß das Zeichen dort, wo der Text hingehört, und die erste Zeile eines
 * Punktes stand um einen ganzen Einzug weiter rechts als ihre eigenen
 * Folgezeilen. Auffallen konnte das nur beim Rendern — darum dieser Test.
 *
 * Fett, Kursiv und Unterstrichen stehen als Markdown-lite im Text; der
 * Renderer muss je Lauf die Schrift wechseln, den Lauf an seiner gemessenen
 * Position zeichnen und den Unterstrich selbst ziehen.
 */

interface DrawCall {
  text: string;
  x: number;
  y: number;
  font: string;
}

interface RectCall {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Ein Kontext, der nur misst und mitschreibt: ein Zeichen = 10 px, fett = 12 px. */
function fakeContext(): { ctx: SKRSContext2D; calls: DrawCall[]; rects: RectCall[] } {
  const calls: DrawCall[] = [];
  const rects: RectCall[] = [];
  const ctx = {
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    measureText(text: string) {
      return { width: text.length * (this.font.includes('bold') ? 12 : 10) };
    },
    fillText(text: string, x: number, y: number) {
      calls.push({ text, x, y, font: this.font });
    },
    fillRect(x: number, y: number, width: number, height: number) {
      rects.push({ x, y, width, height });
    },
    font: '',
    fillStyle: '',
    textAlign: 'left',
    textBaseline: 'top',
    globalAlpha: 1,
  };
  return { ctx: ctx as unknown as SKRSContext2D, calls, rects };
}

const layer = (text: string, maxWidth: number): TextLayer => ({
  id: 't1',
  text,
  x: 0,
  y: 0,
  fontSize: 10,
  fontFamily: 'PTSans',
  fontStyle: 'normal',
  color: '#000000',
  maxWidth,
  align: 'left',
  rotation: 0,
  opacity: 1,
});

const drawn = (calls: DrawCall[]) => calls.map(({ text, x, y }) => ({ text, x, y }));

describe('renderText: Aufzählungen', () => {
  it('setzt das Aufzählungszeichen an den Rand und den Text um den Einzug', () => {
    const { ctx, calls } = fakeContext();
    renderText(ctx, layer('• Punkt', 1000));

    // "• " misst 20 px — das Zeichen steht bei 0, der Text bei 20.
    expect(drawn(calls)).toEqual([
      { text: '•', x: 0, y: 0 },
      { text: 'Punkt', x: 20, y: 0 },
    ]);
  });

  it('stellt die Folgezeile bündig unter den Text, nicht unter das Zeichen', () => {
    const { ctx, calls } = fakeContext();
    // Einzug 20, es bleiben 80 px: "aaa bbb" (70) passt, "ccc" rutscht weiter.
    renderText(ctx, layer('• aaa bbb ccc', 100));

    const xs = calls.map((c) => c.x);
    expect(calls.map((c) => c.text)).toEqual(['•', 'aaa bbb', 'ccc']);
    // Erste Textzeile und Folgezeile teilen sich denselben linken Rand.
    expect(xs[1]).toBe(xs[2]);
    expect(xs[0]).toBeLessThan(xs[1]!);
  });

  it('lässt Fließtext ohne Marker am Rand stehen', () => {
    const { ctx, calls } = fakeContext();
    renderText(ctx, layer('nur Text', 1000));

    expect(drawn(calls)).toEqual([{ text: 'nur Text', x: 0, y: 0 }]);
  });
});

describe('renderText: Auszeichnung', () => {
  it('zeichnet einen fetten Lauf mit fetter Schrift an seiner gemessenen Position', () => {
    const { ctx, calls } = fakeContext();
    renderText(ctx, layer('ab **cd** ef', 1000));

    expect(calls).toEqual([
      { text: 'ab ', x: 0, y: 0, font: '10px PTSans' },
      // Das Leerzeichen hinter dem fetten Wort misst fett — so bricht die
      // Vorschau an derselben Stelle um.
      { text: 'cd ', x: 30, y: 0, font: 'bold 10px PTSans' },
      { text: 'ef', x: 30 + 36, y: 0, font: '10px PTSans' },
    ]);
  });

  it('zieht den Unterstrich als Balken unter dem Lauf', () => {
    const { ctx, calls, rects } = fakeContext();
    renderText(ctx, layer('<u>ab</u> c', 1000));

    expect(drawn(calls)).toEqual([
      { text: 'ab', x: 0, y: 0 },
      { text: ' c', x: 20, y: 0 },
    ]);
    expect(rects).toEqual([{ x: 0, y: 10, width: 20, height: 1 }]);
  });

  it('behält den Blockstil unter den Marks — kursiv schlägt dabei fett', () => {
    const { ctx, calls } = fakeContext();
    renderText(ctx, { ...layer('a _b_', 1000), fontStyle: 'bold' });

    // Nicht `italic bold`: keine unserer Schriften hat einen Fett-Kursiv-Schnitt,
    // und Browser und Skia lösen die Anfrage gegensätzlich auf (Kursivschnitt
    // synthetisch gefettet gegen Fettschnitt synthetisch geneigt, ~5 %
    // Breitenunterschied). Beide Seiten fragen deshalb nur `italic` an.
    expect(calls.map((c) => c.font)).toEqual(['bold 10px PTSans', 'italic 10px PTSans']);
  });
});

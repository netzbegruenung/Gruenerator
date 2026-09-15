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
 */

interface DrawCall {
  text: string;
  x: number;
  y: number;
}

/** Ein Kontext, der nur misst und mitschreibt: ein Zeichen = 10 px. */
function fakeContext(): { ctx: SKRSContext2D; calls: DrawCall[] } {
  const calls: DrawCall[] = [];
  const ctx = {
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    measureText: (text: string) => ({ width: text.length * 10 }),
    fillText: (text: string, x: number, y: number) => {
      calls.push({ text, x, y });
    },
    font: '',
    fillStyle: '',
    textAlign: 'left',
    textBaseline: 'top',
    globalAlpha: 1,
  };
  return { ctx: ctx as unknown as SKRSContext2D, calls };
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

describe('renderText: Aufzählungen', () => {
  it('setzt das Aufzählungszeichen an den Rand und den Text um den Einzug', () => {
    const { ctx, calls } = fakeContext();
    renderText(ctx, layer('• Punkt', 1000));

    // "• " misst 20 px — das Zeichen steht bei 0, der Text bei 20.
    expect(calls).toEqual([
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

    expect(calls).toEqual([{ text: 'nur Text', x: 0, y: 0 }]);
  });
});

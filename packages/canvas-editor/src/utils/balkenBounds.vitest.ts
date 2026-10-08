/**
 * A Dreizeilen line is one bar with one line of text. A bar capped at the
 * canvas width made Konva wrap the rest onto a second line that the fixed bar
 * height hid: the persisted text was whole, the canvas showed half of it.
 */
import { describe, expect, it } from 'vitest';

import { type BalkenInstance } from '../primitives/BalkenGroup';

import { calculateBalkenLayouts, fitBalkenToCanvas } from './balkenBounds';
import { DREIZEILEN_CONFIG } from './dreizeilenLayout';
import { measureTextWidthWithFont } from './textUtils';

const W = 1080;
const H = 1350;
const LONG = 'Mehr Windräder für saubere Energie in Musterstadt';

function textRoom(text: string) {
  const fontSize = DREIZEILEN_CONFIG.text.defaultFontSize;
  return (
    measureTextWidthWithFont(text, fontSize, DREIZEILEN_CONFIG.text.fontFamily) +
    2 * fontSize * DREIZEILEN_CONFIG.balken.paddingFactor
  );
}

describe('calculateBalkenLayouts', () => {
  it('keeps a long line whole: the bar is as wide as its text, not the canvas', () => {
    const { balkens } = calculateBalkenLayouts(
      'triple',
      1,
      [LONG, 'für alle', 'jetzt'],
      W,
      H,
      [0, 0, 0],
      0
    );
    expect(textRoom(LONG)).toBeGreaterThan(W);
    expect(balkens[0]!.width).toBeGreaterThanOrEqual(textRoom(LONG));
  });

  it('lets the group fit bring a too-wide line back onto the canvas by scaling', () => {
    const balken: BalkenInstance = {
      id: 'b',
      mode: 'triple',
      colorSchemeId: 'tanne-sand',
      widthScale: 1,
      offset: { x: 0, y: 0 },
      scale: 1,
      texts: [LONG, 'für alle', 'jetzt'],
      rotation: 0,
      barOffsets: [0, 0, 0],
    };
    const fit = fitBalkenToCanvas(balken, W, H, 20, 0.3);
    expect(fit).not.toBeNull();
    // Scaled down far enough that the whole line, not just a capped bar, fits.
    expect(textRoom(LONG) * fit!.scale).toBeLessThanOrEqual(W - 40);
  });
});

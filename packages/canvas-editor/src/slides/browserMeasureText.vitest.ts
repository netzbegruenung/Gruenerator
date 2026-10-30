import { describe, expect, it, vi } from 'vitest';

vi.mock('@ggraphic/editor/utils/textUtils', () => ({
  measureTextWidthWithFont: (text: string, size: number) => text.length * size * 0.5,
  wrapTextAccurate: (text: string, width: number, size: number) => {
    const lines: string[] = [];
    let line = '';
    for (const w of text.split(' ')) {
      const next = line ? `${line} ${w}` : w;
      if (next.length * size * 0.5 > width && line) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  },
}));

import { browserMeasureText } from './browserMeasureText';

describe('browserMeasureText', () => {
  it('returns lines * size * lineHeight', async () => {
    const measure = await browserMeasureText();
    // 20px, 0,5 em je Zeichen => 10 px je Zeichen; Breite 100 => 10 Zeichen je Zeile (drei Wörter, drei Zeilen).
    const { height } = measure(
      'aaaaa bbbbb ccccc',
      { family: 'X', size: 20, lineHeight: 1.5 },
      100
    );
    expect(height).toBe(3 * 20 * 1.5);
  });

  it('returns Infinity when a single word is wider than the box', async () => {
    const measure = await browserMeasureText();
    const { height } = measure(
      'kurz Donaudampfschifffahrt',
      { family: 'X', size: 20, lineHeight: 1.2 },
      100
    );
    expect(height).toBe(Infinity);
  });
});

import { describe, expect, it } from 'vitest';

import { buildDeckText, buildPageText, buildSharepicText } from './buildSharepicText';

const texts = (...lines: string[]) => ({
  additionalTexts: lines.map((text, i) => ({ id: `t${i}`, text })),
});

describe('buildSharepicText', () => {
  it('describes the type and the texts, and says when there are none', () => {
    expect(buildSharepicText({ canvasType: 'zitat', quote: 'Mut', ...texts('a', 'b') })).toBe(
      'Sharepic-Typ: zitat\nZitat: Mut\nWeitere Texte: a / b'
    );
    expect(buildSharepicText({})).toBe('(Sharepic ist noch leer)');
  });
});

describe('buildPageText', () => {
  it('is the page’s own text, empty without any — the type alone is none', () => {
    expect(buildPageText({ headline: 'Mehr Bus', ...texts('Takt') })).toBe(
      'Überschrift: Mehr Bus\nWeitere Texte: Takt'
    );
    expect(buildPageText({ canvasType: 'zitat', ...texts('  ') })).toBe('');
  });
});

describe('buildDeckText', () => {
  it('numbers the pages by their place and leaves the empty ones out', () => {
    const pages = [{ state: texts('Eins') }, { state: {} }, { state: texts('Drei') }];
    expect(buildDeckText(pages, 1000)).toBe(
      'Seite 1:\nWeitere Texte: Eins\n\nSeite 3:\nWeitere Texte: Drei'
    );
  });

  it('is empty on a design without text, and at most `max` long', () => {
    expect(buildDeckText([{ state: {} }], 1000)).toBe('');
    expect(buildDeckText([{ state: texts('x'.repeat(50)) }], 20)).toHaveLength(20);
  });
});

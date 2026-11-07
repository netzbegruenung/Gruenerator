import { describe, expect, it } from 'vitest';

import { keywordPixels, keywordStyles, trendInTheNews } from './briefingSignals.js';

describe('keywordStyles', () => {
  it('shrinks by rank, accents the first word and fades the tail', () => {
    const styles = keywordStyles(12, 40, 17);
    expect(styles[0]).toEqual({ fontSize: 'clamp(29px, 3.08vw, 40px)', tone: 'accent' });
    expect(styles[1].tone).toBe('strong');
    expect(styles[11].tone).toBe('muted');
    expect(styles[11].fontSize).toBe('clamp(14px, 1.31vw, 17px)');
  });
});

describe('keywordPixels', () => {
  it('is the pixel size and tone behind keywordStyles', () => {
    const px = keywordPixels(12, 40, 17);
    expect(px[0]).toEqual({ px: 40, tone: 'accent' });
    expect(px[11].tone).toBe('muted');
    expect(px.every((p, i) => p.tone === keywordStyles(12, 40, 17)[i].tone)).toBe(true);
    expect(px[11].px).toBeGreaterThanOrEqual(17);
  });
});

describe('trendInTheNews', () => {
  const keywords = new Set(['aigner', 'bundespräsidentin']);
  const titles = ['Antisemitismus-Streit um Claudia Roth: Studenten fordern Entschuldigung'];

  it('matches a trend word against the top keywords', () => {
    expect(trendInTheNews('Ilse Aigner', keywords, titles)).toBe(true);
    expect(trendInTheNews('#Bundespräsidentin', keywords, titles)).toBe(true);
  });

  it('matches a trend that appears in a Greens headline', () => {
    expect(trendInTheNews('Claudia Roth', keywords, titles)).toBe(true);
  });

  it('leaves unrelated trends alone', () => {
    expect(trendInTheNews('#firstdates', keywords, titles)).toBe(false);
    expect(trendInTheNews('Freitagabend', keywords, titles)).toBe(false);
  });
});

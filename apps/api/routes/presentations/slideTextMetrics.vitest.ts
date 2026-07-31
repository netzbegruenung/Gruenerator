import { describe, expect, it } from 'vitest';

import { countLines, deckFaces, metricsReady } from './slideTextMetrics.js';

const DE = deckFaces('de-DE');
const AT = deckFaces('de-AT');

describe('deckFaces', () => {
  it('gives AT its own quote face and DE none', () => {
    expect(AT.quote).not.toBeNull();
    expect(DE.quote).toBeNull();
    expect(AT.body).not.toBe(DE.body);
  });
});

describe('countLines', () => {
  it('registers the deck fonts', async () => {
    // Everything below only measures what the deck actually looks like if the
    // real faces loaded; a silent fallback would still "pass" the wrap tests.
    expect(await metricsReady()).toBe(true);
  });

  it('counts one line for text that fits', async () => {
    const lines = await countLines([{ text: 'Kurz' }], {
      maxWidthPx: 816,
      fontPx: 28,
      faces: DE,
    });
    expect(lines).toBe(1);
  });

  it('wraps on whitespace when the line runs out', async () => {
    const runs = [{ text: 'Wort '.repeat(40).trim() }];
    const wide = await countLines(runs, { maxWidthPx: 816, fontPx: 28, faces: DE });
    const narrow = await countLines(runs, { maxWidthPx: 200, fontPx: 28, faces: DE });
    expect(wide).toBeGreaterThan(1);
    expect(narrow).toBeGreaterThan(wide);
  });

  it('scales with the type size — the same text needs more lines when larger', async () => {
    const runs = [{ text: 'Ein etwas längerer Satz über Klimapolitik und Verkehrswende.' }];
    const small = await countLines(runs, { maxWidthPx: 400, fontPx: 14, faces: DE });
    const large = await countLines(runs, { maxWidthPx: 400, fontPx: 44, faces: DE });
    expect(large).toBeGreaterThan(small);
  });

  it('never splits inside a word', async () => {
    // `overflow-wrap: normal` — an over-long word overflows rather than breaking.
    const lines = await countLines([{ text: 'Donaudampfschifffahrtsgesellschaft' }], {
      maxWidthPx: 40,
      fontPx: 28,
      faces: DE,
    });
    expect(lines).toBe(1);
  });

  it('honours hard breaks', async () => {
    const lines = await countLines([{ text: 'a' }, { text: '\n' }, { text: 'b' }], {
      maxWidthPx: 816,
      fontPx: 28,
      faces: DE,
    });
    expect(lines).toBe(2);
  });

  it('measures a bold run wider than the same text regular', async () => {
    const text = 'Klimaschutz und Gerechtigkeit gehören zusammen';
    const regular = await countLines([{ text }], { maxWidthPx: 300, fontPx: 28, faces: DE });
    const bold = await countLines([{ text, bold: true }], {
      maxWidthPx: 300,
      fontPx: 28,
      faces: DE,
    });
    expect(bold).toBeGreaterThanOrEqual(regular);
  });

  it('measures the AT body face separately from DE', async () => {
    // The brands wrap differently (Gotham Narrow Book vs PT Sans) — the point
    // is that the brand reaches the measurement at all, not which is wider.
    const text = 'Ein Satz über die Verkehrswende in Österreich und anderswo';
    const de = await countLines([{ text }], { maxWidthPx: 300, fontPx: 28, faces: DE });
    const at = await countLines([{ text }], { maxWidthPx: 300, fontPx: 28, faces: AT });
    expect(at).not.toBe(de);
  });

  it('returns one line for empty input', async () => {
    expect(await countLines([], { maxWidthPx: 816, fontPx: 28, faces: DE })).toBe(1);
  });
});

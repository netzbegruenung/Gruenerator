import { describe, expect, it } from 'vitest';

import { CANVAS_FORMATS } from '../../../../packages/ggraphic-editor/src/formats/index.js';

import { crossesFormatCategory, formatCategory, SERVER_FORMATS } from './pageConstants.js';

describe('SERVER_FORMATS', () => {
  it('knows the slide format as digital 1920 × 1080', () => {
    expect(SERVER_FORMATS['slide-16-9']).toMatchObject({
      category: 'digital',
      width: 1920,
      height: 1080,
      print: null,
    });
  });

  it('mirrors the canvas-editor format registry', () => {
    expect(SERVER_FORMATS).toEqual(
      Object.fromEntries(
        CANVAS_FORMATS.map(({ id, category, width, height, dpi, print }) => [
          id,
          { id, category, width, height, dpi, print },
        ])
      )
    );
  });

  it('knows the print formats', () => {
    expect(
      Object.values(SERVER_FORMATS)
        .filter((f) => f.category === 'print')
        .map((f) => f.id)
    ).toEqual([
      'print-visitenkarte-quer',
      'print-visitenkarte-hoch',
      'print-a3-hoch',
      'print-a4-hoch',
      'print-a3-quer',
      'print-a1-hoch',
      'print-a1-quer',
      'print-grossflaeche',
      'print-citylight',
      'print-flyer-dinlang',
      'print-a6-hoch',
      'print-a6-quer',
      'print-briefbogen-a4',
      'print-zeitung-a4',
    ]);
  });
});

describe('formatCategory', () => {
  it.each([
    ['slide-16-9', 'digital'],
    ['post-portrait', 'digital'],
    ['print-a3-hoch', 'print'],
    // An unknown print id from a newer client is still print; legacy ids are digital.
    ['print-a5-quer', 'print'],
    ['story', 'digital'],
    [null, 'digital'],
  ] as const)('%s → %s', (id, category) => {
    expect(formatCategory(id)).toBe(category);
  });
});

describe('crossesFormatCategory', () => {
  it.each([
    ['post-portrait', 'print-a3-hoch', true],
    ['print-visitenkarte-quer', 'post-portrait', true],
    // A null stored format is the digital default.
    [null, 'print-a4-hoch', true],
    [null, 'post-portrait-tall', false],
    ['post-portrait', 'profile-square', false],
    ['print-visitenkarte-quer', 'print-visitenkarte-hoch', false],
  ] as const)('%s → %s: %s', (stored, next, crosses) => {
    expect(crossesFormatCategory(stored, next)).toBe(crosses);
  });
});

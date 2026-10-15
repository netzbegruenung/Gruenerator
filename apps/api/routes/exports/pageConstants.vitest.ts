import { describe, expect, it } from 'vitest';

import { CANVAS_FORMATS } from '../../../../packages/canvas-editor/src/formats/index.js';

import { crossesFormatCategory, formatCategory, SERVER_FORMATS } from './pageConstants.js';

describe('SERVER_FORMATS', () => {
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

  it('knows the four print formats', () => {
    expect(
      Object.values(SERVER_FORMATS)
        .filter((f) => f.category === 'print')
        .map((f) => f.id)
    ).toEqual([
      'print-visitenkarte-quer',
      'print-visitenkarte-hoch',
      'print-a3-hoch',
      'print-a4-hoch',
    ]);
  });
});

describe('formatCategory', () => {
  it.each([
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

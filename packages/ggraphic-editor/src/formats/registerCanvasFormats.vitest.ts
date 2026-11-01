// SPDX-License-Identifier: MPL-2.0
import { afterEach, describe, expect, it } from 'vitest';

import {
  CANVAS_FORMATS,
  canvasFormats,
  formatIdForSize,
  getCanvasFormat,
  getCanvasFormatOrDefault,
  registerCanvasFormats,
  type CanvasFormat,
} from './index.js';

const story: CanvasFormat = {
  id: 'story-9-16',
  label: 'Story',
  description: '1080 × 1920 · 9:16',
  group: 'sharepic',
  category: 'digital',
  width: 1080,
  height: 1920,
  dpi: 72,
  iconKey: 'portrait',
  defaultExport: 'png',
  exportable: ['png', 'jpeg'],
  print: null,
};

afterEach(() => registerCanvasFormats([]));

describe('registerCanvasFormats', () => {
  it('without registration the list and the fallback are the built-ins', () => {
    expect(canvasFormats()).toEqual(CANVAS_FORMATS);
    expect(getCanvasFormat('story-9-16')).toBeNull();
    expect(getCanvasFormatOrDefault('story-9-16').id).toBe('post-portrait');
  });

  it('makes a registered format resolvable, after the built-ins', () => {
    registerCanvasFormats([story]);
    expect(getCanvasFormat('story-9-16')).toBe(story);
    expect(getCanvasFormatOrDefault('story-9-16')).toBe(story);
    expect(formatIdForSize(1080, 1920)).toBe('story-9-16');
    expect(canvasFormats().map((f) => f.id)).toEqual([
      ...CANVAS_FORMATS.map((f) => f.id),
      story.id,
    ]);
    expect(CANVAS_FORMATS.some((f) => f.id === story.id)).toBe(false);
  });

  it('throws on a built-in id and on duplicates, leaving the registry unchanged', () => {
    expect(() => registerCanvasFormats([{ ...story, id: 'post-portrait' }])).toThrow(
      /post-portrait/
    );
    expect(() => registerCanvasFormats([story, story])).toThrow(/story-9-16/);
    expect(canvasFormats()).toEqual(CANVAS_FORMATS);
  });
});

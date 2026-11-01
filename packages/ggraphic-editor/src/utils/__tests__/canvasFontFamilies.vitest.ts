// SPDX-License-Identifier: MPL-2.0
import { describe, it, expect } from 'vitest';

import { canvasFontFamilies } from '@ggraphic/editor/utils/canvasFontFamilies';

import type { FullCanvasConfig } from '@ggraphic/editor/configs/types';

type FontInput = Pick<FullCanvasConfig, 'fonts' | 'elements'>;

describe('canvasFontFamilies', () => {
  it('sammelt die Primärschrift und die Schrift jedes Textelements, ohne Fallback-Stack und doppelt', () => {
    const config = {
      fonts: { primary: 'FixtureSans', fontSize: 60 },
      elements: [
        { type: 'text', fontFamily: 'PT Sans, Arial, sans-serif' },
        { type: 'text', fontFamily: 'FixtureSans, Arial, sans-serif' },
        { type: 'image' },
      ],
    } as unknown as FontInput;

    expect(canvasFontFamilies(config)).toEqual(['FixtureSans', 'PT Sans']);
  });

  it('kommt ohne `fonts` aus', () => {
    const config = {
      elements: [{ type: 'text', fontFamily: 'PT Sans' }],
    } as unknown as FontInput;

    expect(canvasFontFamilies(config)).toEqual(['PT Sans']);
  });
});

import { describe, it, expect } from 'vitest';

import { canvasFontFamilies } from '../canvasFontFamilies';

import type { FullCanvasConfig } from '../../configs/types';

type FontInput = Pick<FullCanvasConfig, 'fonts' | 'elements'>;

describe('canvasFontFamilies', () => {
  it('sammelt die Primärschrift und die Schrift jedes Textelements, ohne Fallback-Stack und doppelt', () => {
    const config = {
      fonts: { primary: 'GrueneTypeNeue', fontSize: 60 },
      elements: [
        { type: 'text', fontFamily: 'PT Sans, Arial, sans-serif' },
        { type: 'text', fontFamily: 'GrueneTypeNeue, Arial, sans-serif' },
        { type: 'image' },
      ],
    } as unknown as FontInput;

    expect(canvasFontFamilies(config)).toEqual(['GrueneTypeNeue', 'PT Sans']);
  });

  it('kommt ohne `fonts` aus', () => {
    const config = {
      elements: [{ type: 'text', fontFamily: 'PT Sans' }],
    } as unknown as FontInput;

    expect(canvasFontFamilies(config)).toEqual(['PT Sans']);
  });
});

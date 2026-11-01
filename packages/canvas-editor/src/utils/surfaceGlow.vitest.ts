import { brandDefault } from '@ggraphic/core';
import { surfaceGlow } from '@ggraphic/editor/brand';
import { registerBrandPacks } from '@ggraphic/editor/host';
import { afterEach, describe, expect, it } from 'vitest';

import { GRUENE_BRAND_PACKS } from '../brand/grueneBrandPacks';

const GLOW = ['#111111', '#222222'] as const;

describe('surfaceGlow', () => {
  afterEach(() => registerBrandPacks(GRUENE_BRAND_PACKS));

  it('paints a ground the way a registered pack declares it', () => {
    registerBrandPacks([
      {
        ...brandDefault,
        backgrounds: [
          { id: 'probe', label: 'Probe', color: '#ABCDEF', ink: '#000000', glow: GLOW },
        ],
      },
    ]);

    expect(surfaceGlow('#abcdef')).toEqual(GLOW);
    expect(surfaceGlow('#ABCDEF')).toEqual(GLOW);
  });

  it('draws a ground no registered pack glows flat', () => {
    registerBrandPacks([brandDefault]);

    expect(surfaceGlow('#abcdef')).toBeNull();
  });
});

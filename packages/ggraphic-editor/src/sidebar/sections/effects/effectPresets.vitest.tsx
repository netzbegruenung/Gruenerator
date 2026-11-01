// SPDX-License-Identifier: MPL-2.0
/**
 * The outline and shadow swatches in the Effekte area come from the brand of the document that is
 * open, not from the first registered pack: the registry is one list for every
 * editor in the host, so an open document of another pack has to say its own.
 */
import { brandDefault, type BrandPack } from '@ggraphic/core';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DocumentBrandContext } from '@ggraphic/editor/brand/documentBrand';
import { OutlineSettings } from '@ggraphic/editor/sidebar/sections/effects/OutlineSettings';
import { ShadowSettings } from '@ggraphic/editor/sidebar/sections/effects/ShadowSettings';

const OTHER_BRAND: BrandPack = {
  ...brandDefault,
  effects: {
    ...brandDefault.effects,
    outlines: ['#123456', '#654321'],
    shadows: ['#abcdef', '#fedcba'],
  },
};

/** The labels of the swatch buttons the open popover offers, in order. */
const swatches = () =>
  screen
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('aria-pressed'))
    .map((button) => button.getAttribute('aria-label'));

describe.each([
  [
    'outline',
    (brand: BrandPack | null) => (
      <DocumentBrandContext.Provider value={brand}>
        <OutlineSettings stroke="#000000" strokeWidth={2} onChange={vi.fn()} />
      </DocumentBrandContext.Provider>
    ),
    (brand: BrandPack) => brand.effects.outlines,
  ],
  [
    'shadow',
    (brand: BrandPack | null) => (
      <DocumentBrandContext.Provider value={brand}>
        <ShadowSettings shadowColor="#000000" shadowBlur={4} onChange={vi.fn()} />
      </DocumentBrandContext.Provider>
    ),
    (brand: BrandPack) => brand.effects.shadows,
  ],
] as const)('%s presets', (_name, controlIn, presetsOf) => {
  it('offers the swatches of the document brand', () => {
    render(controlIn(OTHER_BRAND));
    expect(swatches()).toEqual(presetsOf(OTHER_BRAND).map((c) => `Farbe ${c.toUpperCase()}`));
  });

  it('falls back to the active brand where the document names none', () => {
    render(controlIn(null));
    // The active brand is the editor's default pack: none of the other brand's.
    expect(swatches()).toHaveLength(presetsOf(brandDefault).length);
    expect(swatches()).not.toContain(`Farbe ${presetsOf(OTHER_BRAND)[0].toUpperCase()}`);
  });
});

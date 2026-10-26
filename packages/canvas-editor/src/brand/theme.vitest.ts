import { describe, expect, it } from 'vitest';

import { SYSTEM_ASSETS } from '../utils/canvasAssets';

import { BRAND_THEMES, GRUENE_AT, GRUENE_DE, HELLGRUEN_GLOW, surfaceGlow } from './theme';

// BRAND_THEMES as it stood before the themes became brand packs, copied
// verbatim. The packs must reproduce it value for value: every reader of
// getBrandTheme() keeps seeing exactly this.
const LEGACY_BRAND_THEMES = {
  'de-DE': {
    locale: 'de-DE',
    colors: {
      primary: '#005538',
      secondary: '#6CCD87',
      accent: '#008939',
      accentOnLight: '#008939',
      stoerer: '#00CC4F',
      textOnDark: '#ffffff',
      textOnLight: '#005538',
    },
    backgroundColors: [
      { id: 'tanne', label: 'Tanne', color: '#005538' },
      { id: 'sand', label: 'Sand', color: '#F5F1E9' },
    ],
    defaultBackgroundColor: '#005538',
    textColorMap: {
      '#005538': '#ffffff',
      '#F5F1E9': '#005538',
    },
    fonts: {
      headline: 'GrueneTypeNeue',
      body: 'PT Sans',
      quoteShort: 'GrueneTypeNeue',
      quoteEmphasis: 'GrueneTypeNeue',
    },
    lineHeightFactor: 1.2,
    logo: null,
    quoteMark: { src: SYSTEM_ASSETS.quote.white.src },
  },
  'de-AT': {
    locale: 'de-AT',
    colors: {
      primary: '#257639',
      secondary: '#56af31',
      accent: '#FCEC00',
      accentOnLight: '#257639',
      stoerer: '#E4007C',
      textOnDark: '#ffffff',
      textOnLight: '#257639',
    },
    backgroundColors: [
      { id: 'dunkelgruen', label: 'Dunkelgrün', color: '#257639' },
      { id: 'hellgruen', label: 'Hellgrün', color: '#56af31' },
    ],
    defaultBackgroundColor: '#257639',
    textColorMap: {
      '#257639': '#ffffff',
      '#56af31': '#ffffff',
    },
    fonts: {
      headline: 'GothamNarrow-Ultra',
      body: 'GothamNarrow-Book',
      quoteShort: 'GothamNarrow-Ultra',
      quoteEmphasis: 'Vollkorn',
    },
    lineHeightFactor: 0.9,
    logo: {
      src: SYSTEM_ASSETS.logoAt.weiss.src,
      label: SYSTEM_ASSETS.logoAt.weiss.label,
    },
    quoteMark: { src: SYSTEM_ASSETS.quote.white.src },
  },
};

describe('brand themes from brand packs', () => {
  it('reproduce the legacy themes value for value', () => {
    expect(BRAND_THEMES).toStrictEqual(LEGACY_BRAND_THEMES);
  });

  it('keep the Hellgrün glow, and only there', () => {
    expect(surfaceGlow('#56af31')).toEqual(HELLGRUEN_GLOW);
    for (const pack of [GRUENE_DE, GRUENE_AT]) {
      for (const ground of pack.backgrounds) {
        if (ground.color.toLowerCase() !== '#56af31') expect(surfaceGlow(ground.color)).toBeNull();
      }
    }
  });

  it('give each pack a stable id', () => {
    expect([GRUENE_DE.id, GRUENE_AT.id]).toEqual(['gruene-de', 'gruene-at']);
  });
});

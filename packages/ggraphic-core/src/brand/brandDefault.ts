// SPDX-License-Identifier: MPL-2.0
import { type BrandPack } from './brandPack';

const NIGHT = '#1D3557';
const WHITE = '#FFFFFF';

/**
 * The neutral pack: what ggraphic renders before an organisation brings its
 * own. Every pairing holds 4.5:1 (see brandDefault.vitest.ts). The families
 * are open-licensed; their files follow, until then the host provides them.
 */
export const brandDefault: BrandPack = {
  id: 'default',
  name: 'ggraphic',
  colors: {
    primary: NIGHT,
    secondary: '#457B9D',
    accent: '#F4C542',
    accentOnLight: '#B5470F',
    attention: '#D62839',
    textOnDark: WHITE,
    textOnLight: NIGHT,
  },
  backgrounds: [
    { id: 'night', label: 'Night', color: NIGHT, ink: WHITE },
    { id: 'paper', label: 'Paper', color: '#F6F4EF', ink: NIGHT },
  ],
  defaultBackground: NIGHT,
  fonts: {
    headline: 'Raleway',
    body: 'PT Sans',
    quoteShort: 'Raleway',
    quoteEmphasis: 'Vollkorn',
  },
  fontFaces: [],
  lineHeightFactor: 1.1,
  logo: null,
  quoteMark: null,
};

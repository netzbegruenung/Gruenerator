// SPDX-License-Identifier: MPL-2.0
import { type BrandPack } from './brandPack';

const NIGHT = '#1D3557';
const OCEAN = '#457B9D';
const SUN = '#F4C542';
const RUST = '#B5470F';
const SIGNAL = '#D62839';
const PAPER = '#F6F4EF';
const WHITE = '#FFFFFF';
const BLACK = '#000000';

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
    secondary: OCEAN,
    accent: SUN,
    accentOnLight: RUST,
    attention: SIGNAL,
    textOnDark: WHITE,
    textOnLight: NIGHT,
    surface: PAPER,
  },
  backgrounds: [
    { id: 'night', label: 'Night', color: NIGHT, ink: WHITE },
    { id: 'paper', label: 'Paper', color: PAPER, ink: NIGHT },
  ],
  defaultBackground: NIGHT,
  palette: [
    { id: 'night', label: 'Night', color: NIGHT },
    { id: 'ocean', label: 'Ocean', color: OCEAN },
    { id: 'sun', label: 'Sun', color: SUN },
    { id: 'rust', label: 'Rust', color: RUST },
    { id: 'signal', label: 'Signal', color: SIGNAL },
    { id: 'paper', label: 'Paper', color: PAPER },
    { id: 'white', label: 'White', color: WHITE },
    { id: 'black', label: 'Black', color: BLACK },
  ],
  textPalette: [
    { id: 'black', label: 'Black', color: BLACK },
    { id: 'white', label: 'White', color: WHITE },
    { id: 'night', label: 'Night', color: NIGHT },
    { id: 'paper', label: 'Paper', color: PAPER },
  ],
  markers: {
    swatches: [
      { id: 'sun', label: 'Sun', color: SUN },
      { id: 'sky', label: 'Sky', color: '#A8DADC' },
      { id: 'white', label: 'White', color: WHITE },
    ],
    ink: NIGHT,
  },
  // Light colours never open the list: on white they only read next to a dark one.
  chart: [NIGHT, OCEAN, SIGNAL, RUST, SUN],
  effects: {
    tints: [NIGHT, OCEAN, RUST, SUN],
    shadows: [BLACK, NIGHT, '#3D2B1F', OCEAN],
    outlines: [WHITE, BLACK, NIGHT, SIGNAL],
  },
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

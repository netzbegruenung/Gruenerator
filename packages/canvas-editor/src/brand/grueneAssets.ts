/**
 * The Grünerator's own assets: party logos and word marks, the sunflowers,
 * AT's brush arrow and yellow quote mark, the Info backgrounds. The editor's
 * catalogue (`utils/canvasAssets.ts`) puts them beside its neutral marks;
 * ids and files are F0, stored in canvases and templates.
 */
import { type UniversalAsset } from '../utils/canvasAssets';

export const GRUENE_SYSTEM_ASSETS = {
  sunflower: {
    yellow: {
      src: '/Sonnenblume.png',
      label: 'Sonnenblume (Gelb)',
    },
    green: {
      src: '/sonnenblume_dunkelgruen.svg',
      label: 'Sonnenblume (Grün)',
    },
    // Light-green flower matching the Info sharepic's server render
    // (apps/api/public/sonnenblume_gruen.png).
    greenLight: {
      src: '/sonnenblume_gruen.png',
      label: 'Sonnenblume (Hellgrün)',
    },
    white: {
      src: '/sonnenblume_weiss.svg',
      label: 'Sonnenblume (Weiß)',
    },
    black: {
      src: '/sonnenblume_schwarz.svg',
      label: 'Sonnenblume (Schwarz)',
    },
  },
  // Österreich (de-AT): das Anführungszeichen steht dort in Gelb (CI 2026).
  quoteGelb: {
    src: '/quote-gelb.svg',
    label: 'Anführungszeichen (Gelb)',
  },
  // Deutschland (de-DE) — Wortmarke "BÜNDNIS 90 / DIE GRÜNEN". Die Farbfassung
  // (sandfarbene Schrift) ist für dunkle Hintergründe gedacht.
  logoDe: {
    farbe: {
      src: '/gruene-de-logo.png',
      label: 'Logo Bündnis 90/Die Grünen',
    },
    weiss: {
      src: '/gruene-de-logo-weiss.png',
      label: 'Logo weiß',
    },
    schwarz: {
      src: '/gruene-de-logo-schwarz.png',
      label: 'Logo schwarz',
    },
  },
  // Österreich (de-AT) — reduziertes Ein-Balken-Logo "G DIE GRÜNEN" (CI 2026)
  logoAt: {
    weiss: {
      src: '/gruene-at-logo-weiss.png',
      label: 'Die Grünen (weiß)',
    },
    gruen: {
      src: '/gruene-at-logo-gruen.png',
      label: 'Die Grünen (grün)',
    },
  },
  // Österreich (de-AT): der Wischen-Pfeil der Karussells als Pinselstrich.
  brushArrow: {
    weiss: {
      src: '/brush-arrow-weiss.svg',
      label: 'Pinselpfeil (Weiß)',
    },
    gruen: {
      src: '/brush-arrow-gruen.svg',
      label: 'Pinselpfeil (Grün)',
    },
  },
  backgrounds: {
    info: {
      tanne: '/Info_bg_tanne.png',
      sand: '/Info_bg_sand.png',
    },
  },
} as const;

/** Logos and sunflowers, first in the picker (`ALL_ASSETS`). */
export const GRUENE_DECORATION_ASSETS: UniversalAsset[] = [
  {
    id: 'gruene-de-logo',
    src: GRUENE_SYSTEM_ASSETS.logoDe.farbe.src,
    label: GRUENE_SYSTEM_ASSETS.logoDe.farbe.label,
    category: 'decoration',
    tags: ['logo', 'bündnis 90', 'buendnis', 'grüne', 'gruene', 'deutschland', 'marke', 'farbe'],
    audience: 'de-DE',
    darkPreview: true,
  },
  {
    id: 'gruene-de-logo-weiss',
    src: GRUENE_SYSTEM_ASSETS.logoDe.weiss.src,
    label: GRUENE_SYSTEM_ASSETS.logoDe.weiss.label,
    category: 'decoration',
    tags: [
      'logo',
      'bündnis 90',
      'buendnis',
      'grüne',
      'gruene',
      'deutschland',
      'marke',
      'weiß',
      'weiss',
    ],
    audience: 'de-DE',
  },
  {
    id: 'gruene-de-logo-schwarz',
    src: GRUENE_SYSTEM_ASSETS.logoDe.schwarz.src,
    label: GRUENE_SYSTEM_ASSETS.logoDe.schwarz.label,
    category: 'decoration',
    tags: ['logo', 'bündnis 90', 'buendnis', 'grüne', 'gruene', 'deutschland', 'marke', 'schwarz'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower',
    src: GRUENE_SYSTEM_ASSETS.sunflower.yellow.src,
    label: GRUENE_SYSTEM_ASSETS.sunflower.yellow.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'gelb', 'yellow', 'natur', 'pflanze', 'sommer'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower-green',
    src: GRUENE_SYSTEM_ASSETS.sunflower.green.src,
    label: GRUENE_SYSTEM_ASSETS.sunflower.green.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'grün', 'green', 'natur', 'pflanze'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower-weiss',
    src: GRUENE_SYSTEM_ASSETS.sunflower.white.src,
    label: GRUENE_SYSTEM_ASSETS.sunflower.white.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'weiß', 'weiss', 'white', 'natur', 'pflanze'],
    audience: 'de-DE',
  },
  {
    id: 'sunflower-schwarz',
    src: GRUENE_SYSTEM_ASSETS.sunflower.black.src,
    label: GRUENE_SYSTEM_ASSETS.sunflower.black.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'schwarz', 'black', 'natur', 'pflanze'],
    audience: 'de-DE',
  },
  {
    id: 'gruene-at-logo-weiss',
    src: GRUENE_SYSTEM_ASSETS.logoAt.weiss.src,
    label: GRUENE_SYSTEM_ASSETS.logoAt.weiss.label,
    category: 'decoration',
    tags: ['logo', 'grüne', 'gruene', 'österreich', 'at', 'weiß', 'weiss', 'marke'],
    audience: 'de-AT',
  },
  {
    id: 'gruene-at-logo-gruen',
    src: GRUENE_SYSTEM_ASSETS.logoAt.gruen.src,
    label: GRUENE_SYSTEM_ASSETS.logoAt.gruen.label,
    category: 'decoration',
    tags: ['logo', 'grüne', 'gruene', 'österreich', 'at', 'grün', 'gruen', 'marke'],
    audience: 'de-AT',
  },
];

/** Marks after the neutral ones in the picker. */
export const GRUENE_MARK_ASSETS: UniversalAsset[] = [
  {
    id: 'brush-arrow-gruen',
    src: GRUENE_SYSTEM_ASSETS.brushArrow.gruen.src,
    label: GRUENE_SYSTEM_ASSETS.brushArrow.gruen.label,
    category: 'mark',
    tags: ['pfeil', 'arrow', 'pinsel', 'brush', 'wischen', 'grün', 'gruen'],
    audience: 'de-AT',
  },
];

/** Template variants (`TEMPLATE_ASSETS`): resolvable, not offered in the picker. */
export const GRUENE_TEMPLATE_ASSETS: UniversalAsset[] = [
  {
    id: 'quote-mark-gelb',
    src: GRUENE_SYSTEM_ASSETS.quoteGelb.src,
    label: GRUENE_SYSTEM_ASSETS.quoteGelb.label,
    category: 'mark',
    tags: ['zitat', 'quote', 'gelb'],
    audience: 'de-AT',
  },
  {
    id: 'sunflower-green-light',
    src: GRUENE_SYSTEM_ASSETS.sunflower.greenLight.src,
    label: GRUENE_SYSTEM_ASSETS.sunflower.greenLight.label,
    category: 'decoration',
    tags: ['blume', 'flower', 'grün', 'green', 'hell'],
    audience: 'de-DE',
  },
  {
    id: 'brush-arrow-weiss',
    src: GRUENE_SYSTEM_ASSETS.brushArrow.weiss.src,
    label: GRUENE_SYSTEM_ASSETS.brushArrow.weiss.label,
    category: 'mark',
    tags: ['pfeil', 'arrow', 'pinsel', 'brush', 'wischen', 'weiß', 'weiss'],
    audience: 'de-AT',
  },
];

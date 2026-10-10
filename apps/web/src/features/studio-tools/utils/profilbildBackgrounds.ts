import { CANVAS_COLORS } from '@gruenerator/shared/canvas-editor';
import { BRAND_COLORS } from '@gruenerator/shared/image-studio';

import {
  loadImage,
  type ProfilbildBackground,
  type ProfilbildBaseBackground,
} from './composeProfilbild';

type FlatBackground = Exclude<ProfilbildBaseBackground, { kind: 'image' }>;

export interface Swatch {
  id: string;
  label: string;
  background: FlatBackground;
}

const color = (id: string, label: string, c: string): Swatch => ({
  id,
  label,
  background: { kind: 'color', color: c },
});

export const COLOR_SWATCHES_DE: Swatch[] = [
  color('tanne', 'Tanne', CANVAS_COLORS.TANNE),
  color('klee', 'Klee', CANVAS_COLORS.KLEE),
  color('sonne', 'Sonne', CANVAS_COLORS.SONNE),
  color('himmel', 'Himmel', CANVAS_COLORS.HIMMEL),
  color('sand', 'Sand', CANVAS_COLORS.SAND),
  color('weiss', 'Weiß', CANVAS_COLORS.WHITE),
  color('schwarz', 'Schwarz', CANVAS_COLORS.BLACK),
];

/** Mirrors the de-AT brand theme in packages/canvas-editor/src/brand/theme.ts. */
const AT = { DUNKELGRUEN: '#257639', HELLGRUEN: '#56af31', GELB: '#FCEC00', MAGENTA: '#E4007C' };

export const COLOR_SWATCHES_AT: Swatch[] = [
  color('dunkelgruen', 'Dunkelgrün', AT.DUNKELGRUEN),
  color('hellgruen', 'Hellgrün', AT.HELLGRUEN),
  color('gelb', 'Gelb', AT.GELB),
  color('magenta', 'Magenta', AT.MAGENTA),
  color('weiss', 'Weiß', CANVAS_COLORS.WHITE),
  color('schwarz', 'Schwarz', CANVAS_COLORS.BLACK),
];

const gradient = (id: string, label: string, stops: string[], angle: number): Swatch => ({
  id,
  label,
  background: { kind: 'gradient', stops, angle },
});

export const GRADIENT_SWATCHES: Swatch[] = [
  gradient('tanne-klee', 'Verlauf Tanne zu Klee', [CANVAS_COLORS.TANNE, CANVAS_COLORS.KLEE], 180),
  gradient(
    'klee-grashalm',
    'Verlauf Klee zu Grashalm',
    [CANVAS_COLORS.KLEE, BRAND_COLORS.GRASHALM],
    135
  ),
  gradient(
    'himmel-tanne',
    'Verlauf Himmel zu Tanne',
    [CANVAS_COLORS.HIMMEL, CANVAS_COLORS.TANNE],
    180
  ),
  gradient('sonne-sand', 'Verlauf Sonne zu Sand', [CANVAS_COLORS.SONNE, CANVAS_COLORS.SAND], 180),
  gradient('sand-klee', 'Verlauf Sand zu Klee', [CANVAS_COLORS.SAND, CANVAS_COLORS.KLEE], 180),
  gradient(
    'tanne-nacht',
    'Verlauf Tanne zu Schwarz',
    [CANVAS_COLORS.TANNE, CANVAS_COLORS.BLACK],
    160
  ),
];

export const PRIDE_STRIPES = ['#E40303', '#FF8C00', '#FFED00', '#008026', '#24408E', '#732982'];

export interface PresetOverlay {
  src: string;
  x: number;
  y: number;
  width: number;
  opacity: number;
}

export interface PresetDesign {
  id: string;
  label: string;
  base: FlatBackground | { kind: 'image'; src: string };
  overlays: PresetOverlay[];
}

export function presetDesigns(isAustria: boolean): PresetDesign[] {
  return [
    {
      id: 'tanne-sonnenblume',
      label: 'Tanne mit großer Sonnenblume',
      base: { kind: 'color', color: CANVAS_COLORS.TANNE },
      overlays: [{ src: '/sonnenblume_weiss.svg', x: 0.8, y: 0.28, width: 1, opacity: 0.12 }],
    },
    {
      id: 'klee-sonnenblume',
      label: 'Klee mit Sonnenblume in der Ecke',
      base: { kind: 'color', color: CANVAS_COLORS.KLEE },
      overlays: [
        { src: '/images/Sonnenblume_RGB_gelb.png', x: 0.88, y: 0.12, width: 0.3, opacity: 1 },
      ],
    },
    {
      id: 'sand-sonnenblume',
      label: 'Sand mit grüner Sonnenblume',
      base: { kind: 'color', color: CANVAS_COLORS.SAND },
      overlays: [{ src: '/sonnenblume_gruen.png', x: 0.8, y: 0.24, width: 0.72, opacity: 0.45 }],
    },
    isAustria
      ? {
          id: 'logo',
          label: 'Dunkelgrün mit Logo',
          base: { kind: 'color', color: AT.DUNKELGRUEN },
          overlays: [
            { src: '/gruene-at-logo-weiss.png', x: 0.14, y: 0.13, width: 0.2, opacity: 1 },
          ],
        }
      : {
          id: 'logo',
          label: 'Tanne mit Logo',
          base: { kind: 'color', color: CANVAS_COLORS.TANNE },
          overlays: [{ src: '/gruene-de-logo-weiss.png', x: 0.19, y: 0.1, width: 0.3, opacity: 1 }],
        },
    {
      id: 'pride',
      label: 'Pride',
      base: { kind: 'stripes', colors: PRIDE_STRIPES },
      overlays: [],
    },
  ];
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

/** Loads same-origin assets once per session; failed loads are retried next time. */
export function loadCachedImage(src: string) {
  let pending = imageCache.get(src);
  if (!pending) {
    pending = loadImage(src);
    imageCache.set(src, pending);
    pending.catch(() => imageCache.delete(src));
  }
  return pending;
}

export async function resolvePreset(design: PresetDesign): Promise<ProfilbildBackground> {
  const [base, overlays] = await Promise.all([
    design.base.kind === 'image'
      ? loadCachedImage(design.base.src).then((image) => ({ kind: 'image' as const, image }))
      : design.base,
    Promise.all(
      design.overlays.map(async ({ src, ...rest }) => ({
        ...rest,
        image: await loadCachedImage(src),
      }))
    ),
  ]);
  return { kind: 'preset', base, overlays };
}

export function flatCss(bg: FlatBackground) {
  if (bg.kind === 'color') return bg.color;
  if (bg.kind === 'gradient') return `linear-gradient(${bg.angle}deg, ${bg.stops.join(', ')})`;
  const band = 100 / bg.colors.length;
  const stops = bg.colors.map((c, i) => `${c} ${i * band}% ${(i + 1) * band}%`);
  return `linear-gradient(180deg, ${stops.join(', ')})`;
}

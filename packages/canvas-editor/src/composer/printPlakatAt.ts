/**
 * The AT posters of the CD 2026 (The Odd): the split layout (p. 80), the
 * overlay (p. 81/82) and the person poster (p. 83); the Dreiecksständer
 * (p. 84) is three of them in A1.
 *
 * The grid is X = 6 % of the short side, the minimum margin; the logo is
 * 3 X wide, 4 X out of home (A1). The headline is Gotham Narrow Ultra with
 * its accent in yellow Vollkorn Black Italic, the subline Gotham Book, the
 * Störer Magenta. No sunflower.
 */
import { type TextAccent } from '../utils/textUtils';

import { AT_EMPHASIS_STYLE } from './chromeParts';
import { type ComposedSlide } from './composeSharepic';
import {
  ART,
  fitStack,
  hexRgb,
  HEAD_LEADING,
  impressumElement,
  impressumText,
  motif,
  page,
  placeStack,
  rect,
  scrim,
  stackHeight,
  stoerer,
  WHITE,
  withAccent,
  FULL,
  type Block,
  type Frame,
  type Page,
  type PhotoSrc,
} from './printFrame';

import type { PrintSpec } from '@gruenerator/contracts';

type AtPlakatSpec = Extract<PrintSpec, { variante: 'geteilt' | 'overlay' | 'person' }>;

/** Headline and subline, white, the accent in yellow Vollkorn (p. 21/22). */
function aussage(
  f: Frame,
  slots: AtPlakatSpec['slots'],
  size: number,
  align: 'left' | 'center'
): Block[] {
  const { fonts, colors } = f.theme;
  const accent: TextAccent = {
    fill: colors.accent,
    fontFamily: fonts.quoteEmphasis,
    fontStyle: AT_EMPHASIS_STYLE,
  };
  const blocks: Block[] = [
    {
      before: 0,
      props: {
        id: 'pr-headline',
        text: withAccent(slots.headline, slots.akzent),
        type: 'header',
        fontSize: size,
        fontFamily: fonts.headline,
        fontStyle: 'normal',
        fill: WHITE,
        lineHeight: HEAD_LEADING['de-AT'],
        accent,
        align,
      },
    },
  ];
  if (slots.subline) {
    blocks.push({
      before: 0.3 * size,
      props: {
        id: 'pr-subline',
        text: slots.subline,
        type: 'subheader',
        fontSize: 0.36 * size,
        fontFamily: fonts.body,
        fontStyle: 'normal',
        fill: WHITE,
        lineHeight: 1.3,
        align,
      },
    });
  }
  return blocks;
}

/** The white logo, `width` wide, centred on x/y. */
function logo(p: Page, x: number, y: number, width: number) {
  p.asset('pr-logo', 'gruene-at-logo-weiss', x, y, width);
}

const logoHeight = (width: number) => (width * ART.atLogo.h) / ART.atLogo.w;

/**
 * Split (p. 80): the photo across the top half (upright) or the left half
 * (landscape), Dunkelgrün beside it with the headline; upright the logo stands
 * on the photo, landscape under the headline. The Störer sits on the seam.
 */
function geteilt(f: Frame, spec: AtPlakatSpec, src: PhotoSrc, logoW: number): ComposedSlide {
  const { inner, trim } = f;
  const X = f.margin;
  const quer = trim.width > trim.height;
  const green = f.theme.colors.primary;
  const p = page(green);
  const foto = motif(
    p,
    f,
    spec.slots.foto,
    quer ? { x0: 0, x1: 0.5, y0: 0, y1: 1 } : { x0: 0, x1: 1, y0: 0, y1: 0.5 },
    green,
    src
  );
  const r = 0.09 * f.shortSide;
  const hasStoerer = Boolean(spec.slots.stoerer);
  const logoH = logoHeight(logoW);

  if (quer) {
    // The right half: headline and logo as one centred group.
    const seam = foto.x + foto.width;
    const x = seam + (hasStoerer ? r : 0) + X;
    const width = inner.x + inner.width - x;
    const blocks = fitStack(
      f,
      (size) => aussage(f, spec.slots, size, 'center'),
      0.11 * f.shortSide,
      width,
      inner.height - logoH - 2 * X
    );
    const h = stackHeight(f, blocks, width);
    const top = inner.y + (inner.height - h - X - logoH) / 2;
    placeStack(p, f, blocks, x, top, width);
    logo(p, x + width / 2, top + h + X + logoH / 2, logoW);
    if (spec.slots.stoerer) {
      stoerer(p, f, 'pr-stoerer', spec.slots.stoerer, seam, trim.y + 0.68 * trim.height, r);
    }
  } else {
    logo(p, inner.x + inner.width - logoW / 2, inner.y + logoH / 2, logoW);
    const seam = foto.y + foto.height;
    const top = seam + (hasStoerer ? r : 0) + X * 0.75;
    const blocks = fitStack(
      f,
      (size) => aussage(f, spec.slots, size, 'left'),
      0.12 * f.shortSide,
      inner.width,
      inner.y + inner.height - top
    );
    placeStack(p, f, blocks, inner.x, top, inner.width);
    if (spec.slots.stoerer) {
      stoerer(p, f, 'pr-stoerer', spec.slots.stoerer, inner.x + inner.width - r, seam, r);
    }
  }
  addImpressum(p, f, spec);
  return p.out;
}

/**
 * Overlay (p. 81/82): the photo over the whole page, a square of 0.6 × the
 * short side in the middle carrying headline, subline and logo, the Störer
 * on its top-right corner. `hellgruen`: the box flat in Hellgrün, as the CD
 * shows it (white on Hellgrün is 2.77:1; the screen sharepics draw it as a
 * darker glow, which would make this box look like the Dunkelgrün one).
 */
function overlay(f: Frame, spec: AtPlakatSpec, src: PhotoSrc, logoW: number): ComposedSlide {
  const { trim } = f;
  const X = f.margin;
  const green = f.theme.colors.primary;
  const p = page(green);
  motif(p, f, spec.slots.foto, FULL, green, src);
  const side = 0.6 * f.shortSide;
  const box = {
    x: trim.x + (trim.width - side) / 2,
    y: trim.y + (trim.height - side) / 2,
    width: side,
    height: side,
  };
  p.shape(rect('pr-box', box, spec.stil === 'hellgruen' ? f.theme.colors.secondary : green));

  const pad = 0.6 * X;
  const boxLogo = Math.min(logoW, 0.24 * side);
  const logoH = logoHeight(boxLogo);
  const width = side - 2 * pad;
  // The Störer on the top-right corner reaches r into the box: the text starts below it.
  const r = 0.09 * f.shortSide;
  const head = spec.slots.stoerer ? r : pad;
  const blocks = fitStack(
    f,
    (size) => aussage(f, spec.slots, size, 'center'),
    0.17 * side,
    width,
    side - head - pad - logoH - X
  );
  const h = stackHeight(f, blocks, width);
  const top = Math.max(box.y + (side - h - X - logoH) / 2, box.y + head);
  placeStack(p, f, blocks, box.x + pad, top, width);
  logo(p, box.x + side / 2, top + h + X + logoH / 2, boxLogo);
  if (spec.slots.stoerer) stoerer(p, f, 'pr-stoerer', spec.slots.stoerer, box.x + side, box.y, r);
  addImpressum(p, f, spec);
  return p.out;
}

/**
 * Person (p. 83): the person on the photo, standing on Dunkelgrün that the
 * photo fades into; the headline large at the top left (landscape: left of the
 * person), the logo in the corner opposite (upright bottom left, landscape top
 * right), the Störer beside the person.
 */
function person(f: Frame, spec: AtPlakatSpec, src: PhotoSrc, logoW: number): ComposedSlide {
  const { inner, trim } = f;
  const X = f.margin;
  const quer = trim.width > trim.height;
  const green = f.theme.colors.primary;
  const p = page(green);
  const foto = motif(
    p,
    f,
    spec.slots.foto,
    quer ? { x0: 0.38, x1: 1, y0: 0, y1: 1 } : { x0: 0, x1: 1, y0: 0.34, y1: 1 },
    green,
    src
  );
  // The seam fades into the green, as on the studio photos of the CD.
  const rgb = hexRgb(green);
  if (quer) {
    scrim(p, 'pr-scrim', { ...foto, width: foto.width * 0.35 }, rgb, 1, 180);
    // The logo stands top right on the photo.
    scrim(
      p,
      'pr-scrim-oben',
      { ...foto, height: inner.y + 2.2 * logoHeight(logoW) },
      rgb,
      0.75,
      270
    );
  } else {
    scrim(p, 'pr-scrim', { ...foto, height: foto.height * 0.3 }, rgb, 1, 270);
  }

  const logoH = logoHeight(logoW);
  const width = quer ? foto.x + foto.width * 0.2 - inner.x : inner.width * 0.92;
  const room = quer ? inner.height * 0.62 : foto.y + foto.height * 0.12 - inner.y;
  const blocks = fitStack(
    f,
    (size) => aussage(f, spec.slots, size, 'left'),
    0.13 * f.shortSide,
    width,
    room
  );
  placeStack(p, f, blocks, inner.x, inner.y, width);
  const textBottom = inner.y + stackHeight(f, blocks, width);

  if (quer) logo(p, inner.x + inner.width - logoW / 2, inner.y + logoH / 2, logoW);
  else logo(p, inner.x + logoW / 2, inner.y + inner.height - logoH / 2, logoW);

  if (spec.slots.stoerer) {
    const r = 0.09 * f.shortSide;
    const x = quer ? inner.x + r + X : inner.x + r;
    const y = quer
      ? inner.y + inner.height - r - X
      : Math.min(inner.y + inner.height - logoH - X - r, textBottom + 0.3 * trim.height);
    stoerer(p, f, 'pr-stoerer', spec.slots.stoerer, x, y, r);
  }
  addImpressum(p, f, spec);
  return p.out;
}

function addImpressum(p: Page, f: Frame, spec: AtPlakatSpec) {
  if (spec.impressum) p.text(impressumElement(f, impressumText(spec.impressum)));
}

export function plakatAt(f: Frame, spec: AtPlakatSpec, src: PhotoSrc): ComposedSlide {
  // 3 X, out of home (A1) 4 X (p. 57–59).
  const outOfHome = f.format.print.trimMm.w * f.format.print.trimMm.h >= 594 * 841;
  const logoW = (outOfHome ? 4 : 3) * f.margin;
  if (spec.variante === 'geteilt') return geteilt(f, spec, src, logoW);
  if (spec.variante === 'overlay') return overlay(f, spec, src, logoW);
  return person(f, spec, src, logoW);
}

/**
 * Shared helpers for Österreich (de-AT) napi-canvas sharepic renderers.
 *
 * Mirrors the client konva AT configs (packages/canvas-editor brand/theme +
 * headlineAtLayout) so the server and Studio renders stay pixel-close.
 * CI 2026: Dunkelgrün #257639, Gelb #FCEC00, Gotham Narrow + Vollkorn,
 * Zeilenabstand × 0,9, weißes Ein-Balken-Logo.
 */
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { loadImage, type SKRSContext2D as Ctx, type Image } from '@napi-rs/canvas';

import { registerFonts } from '../../../../services/sharepic/canvas/fileManagement.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const AT_BRAND = {
  primary: '#257639', // Dunkelgrün — Hauptfarbe
  secondary: '#56af31', // Hellgrün
  accent: '#FCEC00', // Gelb
  textOnDark: '#ffffff',
  fonts: {
    headline: 'GothamNarrow-Ultra',
    body: 'GothamNarrow-Book',
    // Zitate tragen denselben Display-Schnitt wie Headlines und Untertitel —
    // Bold fiel als einziges AT-Sujet aus der Reihe.
    quoteShort: 'GothamNarrow-Ultra',
    quoteEmphasis: 'Vollkorn',
  },
  lineHeightFactor: 0.9,
} as const;

export const CANVAS = { width: 1080, height: 1350 } as const;

/**
 * Flächen-sujet geometry — mirrors HEADLINE_AT_CONFIG in canvas-editor.
 * Kein Logo: die CI zeigt die Fläche als reine Typografie, `contentBottom` ist
 * daher nur die Blattkante minus Rand, keine Logo-Grenze.
 */
export const HEADLINE = {
  marginX: 90,
  marginTop: 210,
  maxWidth: CANVAS.width - 90 * 2,
  gap: 18,
  baseFontSize: 104,
  minFontSize: 62,
  bodyFontSize: 44,
  contentBottom: CANVAS.height - 90,
} as const;

/** Native aspect ratio of the one-bar logo asset (1410 × 1239). */
export const LOGO_ASPECT = 1239 / 1410;

/**
 * Overlay-sujet geometry — mirrors OVERLAY_AT_CONFIG in canvas-editor.
 * Foto vollflächig, darauf eine zentrierte quadratische Farbfläche mit
 * zentrierter Headline, Subline und mittigem Logo (CI 2026, Bild „Overlay").
 * Beide Dateien müssen zusammen geändert werden — sie sind handverdrahtet.
 */
export const OVERLAY = {
  box: { x: 120, y: 255, width: 840, height: 840 },
  padding: 60,
  /** Text measure inside the box: 840 − 2 × 60. */
  maxWidth: 720,
  gap: 24,
  /**
   * Larger than it looks: in the CI the headline fills roughly 78 % of the box
   * width, so „Das ist eine" measures ~600 px of the 720 px Satzmaß.
   */
  baseFontSize: 118,
  minFontSize: 66,
  sublineFontSize: 34,
  /** Gap between the subline and the logo below it. */
  sublineGap: 40,
  logoWidth: 200,
} as const;

const LOGO_WEISS_PATH = path.resolve(__dirname, '../../../../public/gruene-at-logo-weiss.png');
const QUOTE_WHITE_PATH = path.resolve(__dirname, '../../../../public/quote-white.svg');
const QUOTE_GELB_PATH = path.resolve(__dirname, '../../../../public/quote-gelb.svg');

/**
 * Zitat-sujet geometry — mirrors ZITAT_AT_CONFIG in canvas-editor.
 * Anders als in Deutschland: mittig gesetzt, gelbes Anführungszeichen, Logo
 * rechts oben, und der Block hängt nicht am Blattboden, sondern wird als
 * Gruppe um `groupCenterRatio` zentriert.
 */
export const ZITAT = {
  margin: 130,
  maxWidth: 820,
  groupCenterRatio: 0.48,
  markSizeRatio: 1.15,
  markGapToText: 22,
  baseFontSize: 56,
  minFontSize: 40,
  maxFontSize: 72,
  lineHeightRatio: 1.15,
  nameFontSizeRatio: 0.6,
  nameGapRatio: 0.75,
  logo: { width: 150, margin: 70 },
  scrim: {
    color: '37, 118, 57',
    curve: [
      { at: 0, opacity: 0 },
      { at: 0.18, opacity: 0 },
      { at: 0.42, opacity: 0.58 },
      { at: 1, opacity: 0.75 },
    ],
  },
} as const;

/**
 * Zitat-Pur-Geometrie — mirrors ZITAT_PURE_AT_CONFIG in canvas-editor.
 * Ohne Foto traegt die Flaeche allein: groesserer Grad als beim Foto-Sujet,
 * weisses Anfuehrungszeichen statt gelbem, Block genau mittig.
 */
export const ZITAT_PURE = {
  margin: 115,
  maxWidth: 850,
  groupCenterRatio: 0.5,
  markSizeRatio: 1.47,
  markGapToText: 26,
  baseFontSize: 72,
  minFontSize: 46,
  maxFontSize: 88,
  lineHeightRatio: 1.15,
  maxLines: 5,
  growBelowLines: 3,
  nameFontSizeRatio: 0.47,
  nameGapRatio: 0.61,
  topBoundary: 120,
  bottomBoundary: 1230,
} as const;

export function registerAtFonts(): void {
  registerFonts();
}

// The logo is a fixed static asset — decode once and reuse across requests.
let logoPromise: Promise<Image> | null = null;
export async function loadAtLogo(): Promise<Image> {
  if (!logoPromise) logoPromise = loadImage(LOGO_WEISS_PATH);
  return logoPromise;
}

// Anführungszeichen. Auf Foto (zitat-at) steht es gelb, auf der Farbfläche
// (zitat-pure-at) weiß — dieselben Assets, die die Konva-Configs referenzieren.
// Einmal dekodiert, dann über Requests hinweg wiederverwendet.
let quoteWhitePromise: Promise<Image> | null = null;
export async function loadAtQuoteWhite(): Promise<Image> {
  if (!quoteWhitePromise) quoteWhitePromise = loadImage(QUOTE_WHITE_PATH);
  return quoteWhitePromise;
}

let quoteGelbPromise: Promise<Image> | null = null;
export async function loadAtQuoteGelb(): Promise<Image> {
  if (!quoteGelbPromise) quoteGelbPromise = loadImage(QUOTE_GELB_PATH);
  return quoteGelbPromise;
}

/**
 * Draw the white one-bar logo at an explicit position and width. Geometry is
 * passed in rather than read from a shared constant: each sujet places the logo
 * differently (the overlay box centres a smaller mark inside itself), and a
 * hidden default is what let the flat sujet keep drawing a logo the CI does not
 * show. Height follows the asset's native ratio.
 */
export async function drawAtLogo(
  ctx: Ctx,
  opts: { x: number; y: number; width: number }
): Promise<void> {
  const logo = await loadAtLogo();
  const h = opts.width * (logo.height / logo.width);
  ctx.drawImage(logo, opts.x, opts.y, opts.width, h);
}

/** Draw `image` across the whole canvas, cropped to cover without distortion. */
export function drawCoverImage(ctx: Ctx, image: Image): void {
  const canvasAspect = CANVAS.width / CANVAS.height;
  let sx: number, sy: number, sWidth: number, sHeight: number;
  if (image.width / image.height > canvasAspect) {
    sHeight = image.height;
    sWidth = image.height * canvasAspect;
    sx = (image.width - sWidth) / 2;
    sy = 0;
  } else {
    sWidth = image.width;
    sHeight = image.width / canvasAspect;
    sx = 0;
    sy = (image.height - sHeight) / 2;
  }
  ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, CANVAS.width, CANVAS.height);
}

export interface OverlayContent {
  line1: string;
  /** Gelbe Vollkorn-Betonung (Zeile 2). */
  accent: string;
  line3: string;
  subline: string;
}

/**
 * Draw the overlay box's contents: three centred headline zones, a subline and
 * the logo. Headline, subline and logo are treated as ONE group that is centred
 * vertically inside the padded box — pinning the logo to the box floor instead
 * left a gaping hole under short headlines. All zones shrink by a single
 * uniform factor until they fit. Mirrors calculateOverlayAtLayout on the client.
 */
export async function drawOverlayContent(ctx: Ctx, content: OverlayContent): Promise<void> {
  const centreX = OVERLAY.box.x + OVERLAY.box.width / 2;
  const logoHeight = OVERLAY.logoWidth * LOGO_ASPECT;

  const zones: HeadlineZone[] = [
    { text: content.line1, kind: 'headline' },
    { text: content.accent, kind: 'accent' },
    { text: content.line3, kind: 'headline' },
  ];

  const fontFor = (kind: HeadlineZone['kind'], size: number): { font: string; fill: string } => {
    if (kind === 'accent')
      return { font: `italic ${size}px ${AT_BRAND.fonts.quoteEmphasis}`, fill: AT_BRAND.accent };
    return { font: `${size}px ${AT_BRAND.fonts.headline}`, fill: AT_BRAND.textOnDark };
  };

  // Flatten zones into wrapped lines at a given uniform scale, plus the subline.
  const measure = (
    scale: number
  ): { lines: { text: string; kind: HeadlineZone['kind'] }[]; sub: string[]; height: number } => {
    const size = Math.round(OVERLAY.baseFontSize * scale);
    const subSize = Math.round(OVERLAY.sublineFontSize * scale);
    const lines: { text: string; kind: HeadlineZone['kind'] }[] = [];
    for (const z of zones) {
      if (!z.text) continue;
      ctx.font = fontFor(z.kind, size).font;
      for (const line of wrapText(ctx, z.text, OVERLAY.maxWidth))
        lines.push({ text: line, kind: z.kind });
    }
    ctx.font = `${subSize}px ${AT_BRAND.fonts.body}`;
    const sub = content.subline ? wrapText(ctx, content.subline, OVERLAY.maxWidth) : [];
    const height =
      lines.length * size * AT_BRAND.lineHeightFactor +
      (sub.length ? OVERLAY.gap + sub.length * subSize * 1.2 : 0);
    return { lines, sub, height };
  };

  const minScale = OVERLAY.minFontSize / OVERLAY.baseFontSize;
  // The text has to share the padded box with the logo below it.
  const available = OVERLAY.box.height - 2 * OVERLAY.padding - OVERLAY.sublineGap - logoHeight;
  let scale = 1;
  let m = measure(scale);
  while (m.height > available && scale > minScale) {
    scale = Math.max(minScale, scale - 0.04);
    m = measure(scale);
  }

  const size = Math.round(OVERLAY.baseFontSize * scale);
  const subSize = Math.round(OVERLAY.sublineFontSize * scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const groupHeight = m.height + OVERLAY.sublineGap + logoHeight;
  const groupTop =
    OVERLAY.box.y + OVERLAY.padding + (OVERLAY.box.height - 2 * OVERLAY.padding - groupHeight) / 2;
  let y = groupTop;
  for (const l of m.lines) {
    const { font, fill } = fontFor(l.kind, size);
    ctx.font = font;
    ctx.fillStyle = fill;
    ctx.fillText(l.text, centreX, y);
    y += size * AT_BRAND.lineHeightFactor;
  }
  if (m.sub.length) {
    y += OVERLAY.gap;
    ctx.font = `${subSize}px ${AT_BRAND.fonts.body}`;
    ctx.fillStyle = AT_BRAND.textOnDark;
    for (const line of m.sub) {
      ctx.fillText(line, centreX, y);
      y += subSize * 1.2;
    }
  }

  await drawAtLogo(ctx, {
    x: centreX - OVERLAY.logoWidth / 2,
    y: groupTop + m.height + OVERLAY.sublineGap,
    width: OVERLAY.logoWidth,
  });
}

export interface HeadlineZone {
  text: string;
  /** 'headline' = white Gotham Ultra, 'accent' = gelb Vollkorn italic, 'body' = white Gotham Book */
  kind: 'headline' | 'accent' | 'body';
}

/**
 * Draw a stacked headline block (white Gotham + gelbe Vollkorn-Betonung + body),
 * shrinking all zones by a uniform factor down to minFontSize so the block never
 * overruns the logo / canvas edge. Mirrors calculateHeadlineAtLayout on the client.
 */
export function drawHeadlineStack(ctx: Ctx, zones: HeadlineZone[], align: 'left' | 'center'): void {
  const fontFor = (kind: HeadlineZone['kind'], size: number): { font: string; fill: string } => {
    if (kind === 'accent')
      return { font: `italic ${size}px ${AT_BRAND.fonts.quoteEmphasis}`, fill: AT_BRAND.accent };
    if (kind === 'body')
      return {
        font: `${Math.round(size * (HEADLINE.bodyFontSize / HEADLINE.baseFontSize))}px ${AT_BRAND.fonts.body}`,
        fill: AT_BRAND.textOnDark,
      };
    return { font: `${size}px ${AT_BRAND.fonts.headline}`, fill: AT_BRAND.textOnDark };
  };

  const measure = (
    scale: number
  ): { lines: { text: string; kind: HeadlineZone['kind']; size: number }[]; bottom: number } => {
    const size = Math.round(HEADLINE.baseFontSize * scale);
    const out: { text: string; kind: HeadlineZone['kind']; size: number }[] = [];
    let y = HEADLINE.marginTop;
    for (const z of zones) {
      if (!z.text) continue;
      const zoneSize = z.kind === 'body' ? Math.round(HEADLINE.bodyFontSize * scale) : size;
      const { font } = fontFor(z.kind, size);
      ctx.font = font;
      const wrapped = wrapText(ctx, z.text, HEADLINE.maxWidth);
      const lh = zoneSize * AT_BRAND.lineHeightFactor;
      for (const line of wrapped) out.push({ text: line, kind: z.kind, size: zoneSize });
      y += wrapped.length * lh + HEADLINE.gap;
    }
    return { lines: out, bottom: y };
  };

  const minScale = HEADLINE.minFontSize / HEADLINE.baseFontSize;
  let scale = 1;
  let m = measure(scale);
  while (m.bottom > HEADLINE.contentBottom && scale > minScale) {
    scale = Math.max(minScale, scale - 0.04);
    m = measure(scale);
  }

  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const x = align === 'center' ? CANVAS.width / 2 : HEADLINE.marginX;
  let y = HEADLINE.marginTop;
  let prevKind: HeadlineZone['kind'] | null = null;
  for (const l of m.lines) {
    if (prevKind !== null && prevKind !== l.kind) y += HEADLINE.gap;
    const { font, fill } = fontFor(l.kind, l.size);
    ctx.font = font;
    ctx.fillStyle = fill;
    ctx.fillText(l.text, x, y);
    y += l.size * AT_BRAND.lineHeightFactor;
    prevKind = l.kind;
  }
}

/** Word-wrap `text` to `maxWidth` using the currently-set ctx font. */
export function wrapText(ctx: Ctx, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Draw a centred (or given-align) multi-line block; returns the next y. */
export function drawLines(
  ctx: Ctx,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number
): number {
  let cy = y;
  for (const line of lines) {
    ctx.fillText(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

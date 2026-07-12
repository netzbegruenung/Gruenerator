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
    quoteShort: 'GothamNarrow-Bold',
    quoteEmphasis: 'Vollkorn',
  },
  lineHeightFactor: 0.9,
} as const;

export const CANVAS = { width: 1080, height: 1350 } as const;

/** Headline-sujet geometry — mirrors HEADLINE_AT_CONFIG in canvas-editor. */
export const HEADLINE = {
  marginX: 90,
  marginTop: 210,
  maxWidth: CANVAS.width - 90 * 2,
  gap: 18,
  baseFontSize: 104,
  minFontSize: 62,
  bodyFontSize: 44,
  logo: { width: 300, height: 264, y: 1040 },
  contentBottom: 1040 - 40,
} as const;

const LOGO_WEISS_PATH = path.resolve(__dirname, '../../../../public/gruene-at-logo-weiss.png');

export function registerAtFonts(): void {
  registerFonts();
}

// The logo is a fixed static asset — decode once and reuse across requests.
let logoPromise: Promise<Image> | null = null;
export async function loadAtLogo(): Promise<Image> {
  if (!logoPromise) logoPromise = loadImage(LOGO_WEISS_PATH);
  return logoPromise;
}

/** Draw the white one-bar logo at its canonical position (align controls x). */
export async function drawAtLogo(ctx: Ctx, align: 'left' | 'center'): Promise<void> {
  const logo = await loadAtLogo();
  const w = HEADLINE.logo.width;
  const h = w * (logo.height / logo.width);
  const x = align === 'center' ? (CANVAS.width - w) / 2 : HEADLINE.marginX;
  ctx.drawImage(logo, x, HEADLINE.logo.y, w, h);
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

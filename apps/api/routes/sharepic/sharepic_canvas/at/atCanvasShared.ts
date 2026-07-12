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

const LOGO_WEISS_PATH = path.resolve(__dirname, '../../../../public/gruene-at-logo-weiss.png');

export function registerAtFonts(): void {
  registerFonts();
}

export async function loadAtLogo(): Promise<Image> {
  return loadImage(LOGO_WEISS_PATH);
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

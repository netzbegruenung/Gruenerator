/**
 * AT Overlay Layout Utility (Österreich / de-AT)
 *
 * Geometry for the Overlay-Sujet: a full-bleed photo carrying a centred square
 * colour field, and inside it a centred three-line headline (weiß Gotham Ultra
 * / gelbe Vollkorn-Betonung / weiß Gotham Ultra), a subline in Gotham Book and
 * the weiße Ein-Balken-Logo.
 *
 * Headline, subline and logo form ONE group that is centred vertically inside
 * the padded box — pinning the logo to the box floor leaves a gaping hole under
 * short headlines.
 *
 * Mirrored by OVERLAY + drawOverlayContent in
 * apps/api/routes/sharepic/sharepic_canvas/at/atCanvasShared.ts. The two are
 * hand-synced: change them together.
 *
 * Zeilenabstand = Schriftgröße × 0,9 (CI). Die Fläche ohne Foto liegt in
 * headlineAtLayout.ts.
 */

import { getBrandTheme } from '../brand/theme';

import { SYSTEM_ASSETS } from './canvasAssets';
import { wrapTextAccurate } from './textUtils';

const AT = getBrandTheme('de-AT');

/** Native aspect ratio of the one-bar logo asset (1410 × 1239). */
const LOGO_ASPECT = 1239 / 1410;

export const OVERLAY_AT_CONFIG = {
  canvas: { width: 1080, height: 1350 },
  box: { x: 120, y: 255, width: 840, height: 840 },
  padding: 60,
  /** Text measure inside the box: 840 − 2 × 60. */
  maxWidth: 720,
  lineHeightRatio: AT.lineHeightFactor, // 0.9
  /** Gap between the headline block and the subline. */
  gap: 24,
  /** Gap between the subline and the logo. */
  sublineGap: 40,
  headline: {
    fontFamily: AT.fonts.headline, // GothamNarrow-Ultra
    fontStyle: 'normal' as const,
    // Larger than it looks: in the CI the headline fills roughly 78 % of the
    // box width, so „Das ist eine" measures ~600 px of the 720 px Satzmaß.
    fontSize: 118,
    minFontSize: 66,
    color: AT.colors.textOnDark,
  },
  accent: {
    fontFamily: AT.fonts.quoteEmphasis, // Vollkorn
    fontStyle: 'italic' as const,
    fontSize: 118,
    minFontSize: 66,
    color: AT.colors.accent, // Gelb
  },
  subline: {
    fontFamily: AT.fonts.body, // GothamNarrow-Book
    fontStyle: 'normal' as const,
    fontSize: 34,
    lineHeightRatio: 1.2,
    color: AT.colors.textOnDark,
  },
  logo: {
    src: SYSTEM_ASSETS.logoAt.weiss.src,
    width: 200,
    height: Math.round(200 * LOGO_ASPECT), // 176
  },
} as const;

export interface OverlayZone {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: 'normal' | 'italic' | 'bold' | 'bold italic';
  /** Line height multiplier; defaults to the CI's 0.9. */
  lineHeightRatio?: number;
}

export interface OverlayZoneLayout {
  y: number;
  fontSize: number;
}

export interface OverlayAtLayout {
  /** Headline zones (line1, accent, line3) followed by the subline. */
  zones: OverlayZoneLayout[];
  logo: { x: number; y: number; width: number; height: number };
}

const CFG = OVERLAY_AT_CONFIG;
const MIN_SCALE = CFG.headline.minFontSize / CFG.headline.fontSize;
/** Text has to share the padded box with the logo below it. */
const AVAILABLE = CFG.box.height - 2 * CFG.padding - CFG.sublineGap - CFG.logo.height;

/** Total height of the text block (headline zones + gap + subline) at `scale`. */
function measure(zones: OverlayZone[], scale: number): { heights: number[]; total: number } {
  const heights = zones.map((zone) => {
    if (!zone.text) return 0;
    const fontSize = Math.round(zone.fontSize * scale);
    const lines = wrapTextAccurate(
      zone.text,
      CFG.maxWidth,
      fontSize,
      zone.fontFamily,
      zone.fontStyle
    ).length;
    return lines * fontSize * (zone.lineHeightRatio ?? CFG.lineHeightRatio);
  });
  // The gap only exists where the subline does — it is the last zone.
  const subline = heights[heights.length - 1] ?? 0;
  const total = heights.reduce((a, b) => a + b, 0) + (subline > 0 ? CFG.gap : 0);
  return { heights, total };
}

/**
 * Stack the headline zones plus subline inside the overlay box, shrinking all
 * of them by one uniform factor until they fit above the logo, then centre the
 * whole group (text + logo) vertically in the padded box.
 */
export function calculateOverlayAtLayout(zones: OverlayZone[]): OverlayAtLayout {
  let scale = 1;
  let m = measure(zones, scale);
  while (m.total > AVAILABLE && scale > MIN_SCALE) {
    scale = Math.max(MIN_SCALE, scale - 0.04);
    m = measure(zones, scale);
  }

  const groupHeight = m.total + CFG.sublineGap + CFG.logo.height;
  let y = CFG.box.y + CFG.padding + (CFG.box.height - 2 * CFG.padding - groupHeight) / 2;

  const layout: OverlayZoneLayout[] = [];
  zones.forEach((zone, i) => {
    // The subline is the last zone and is the only one preceded by the gap.
    if (i === zones.length - 1 && m.heights[i] > 0) y += CFG.gap;
    layout.push({ y, fontSize: Math.round(zone.fontSize * scale) });
    y += m.heights[i] ?? 0;
  });

  return {
    zones: layout,
    logo: {
      x: CFG.box.x + (CFG.box.width - CFG.logo.width) / 2,
      y: y + CFG.sublineGap,
      width: CFG.logo.width,
      height: CFG.logo.height,
    },
  };
}

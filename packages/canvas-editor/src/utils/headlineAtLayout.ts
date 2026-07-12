/**
 * AT Headline Layout Utility (Österreich / de-AT)
 *
 * Shared geometry for the two solid-green "headline" sujets — Info und
 * Dreizeilen (CI 2026). A stacked block of up to three text zones (white
 * Gotham headline + gelbe Vollkorn-Betonung), vertically centred, with the
 * weiße Ein-Balken-Logo below.
 *
 * Zeilenabstand = Schriftgröße × 0,9 (CI). Reused by info_at / dreizeilen_at.
 */

import { getBrandTheme } from '../brand/theme';
import { SYSTEM_ASSETS } from './canvasAssets';
import { wrapTextAccurate } from './textUtils';

const AT = getBrandTheme('de-AT');

export const HEADLINE_AT_CONFIG = {
  canvas: { width: 1080, height: 1350 },
  margin: { x: 90, top: 210 },
  maxWidth: 900, // 1080 - 90 - 90
  lineHeightRatio: AT.lineHeightFactor, // 0.9
  gapBetweenZones: 18,
  headline: {
    fontFamily: AT.fonts.headline, // GothamNarrow-Ultra
    fontStyle: 'normal' as const,
    fontSize: 104,
    minFontSize: 62,
    color: AT.colors.textOnDark, // white
  },
  accent: {
    fontFamily: AT.fonts.quoteEmphasis, // Vollkorn
    fontStyle: 'italic' as const,
    fontSize: 104,
    minFontSize: 62,
    color: AT.colors.accent, // Gelb
  },
  body: {
    fontFamily: AT.fonts.body, // GothamNarrow-Book
    fontStyle: 'normal' as const,
    fontSize: 44,
    minFontSize: 30,
    color: AT.colors.textOnDark, // white
  },
  logo: {
    src: SYSTEM_ASSETS.logoAt.weiss.src,
    width: 300,
    height: 264, // 300 * (1239/1410) — keeps official aspect ratio
    x: 90,
    y: 1040,
  },
} as const;

export interface HeadlineZone {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontStyle: 'normal' | 'italic' | 'bold' | 'bold italic';
}

export interface HeadlineZoneLayout {
  y: number;
  fontSize: number;
}

/** Content must stay above the logo (which sits at logo.y) with some breathing room. */
const CONTENT_BOTTOM = HEADLINE_AT_CONFIG.logo.y - 40;
/** Ratio applied to a zone's declared minFontSize floor. */
const MIN_SCALE = HEADLINE_AT_CONFIG.headline.minFontSize / HEADLINE_AT_CONFIG.headline.fontSize;

/** Stack zones top-down from `margin.top` at a given uniform scale; return per-zone y+fontSize and the block bottom. */
function stack(
  zones: HeadlineZone[],
  scale: number
): { layout: HeadlineZoneLayout[]; bottom: number } {
  const cfg = HEADLINE_AT_CONFIG;
  const layout: HeadlineZoneLayout[] = [];
  let y = cfg.margin.top;
  for (const zone of zones) {
    const fontSize = Math.round(zone.fontSize * scale);
    const lines = zone.text
      ? wrapTextAccurate(zone.text, cfg.maxWidth, fontSize, zone.fontFamily, zone.fontStyle).length
      : 0;
    layout.push({ y, fontSize });
    const blockHeight = lines * fontSize * cfg.lineHeightRatio;
    y += blockHeight + (lines > 0 ? cfg.gapBetweenZones : 0);
  }
  return { layout, bottom: y };
}

/**
 * Stack the provided zones top-down from `margin.top`, shrinking all zones by a
 * uniform factor (down to minFontSize) so the block never runs past the logo /
 * canvas edge — mirrors the server renderer's auto-fit. Returns y + fontSize per
 * zone.
 */
export function calculateHeadlineAtLayout(zones: HeadlineZone[]): HeadlineZoneLayout[] {
  let scale = 1;
  let result = stack(zones, scale);
  // Shrink in 4% steps until the block fits above the logo or we hit the floor.
  while (result.bottom > CONTENT_BOTTOM && scale > MIN_SCALE) {
    scale = Math.max(MIN_SCALE, scale - 0.04);
    result = stack(zones, scale);
  }
  return result.layout;
}

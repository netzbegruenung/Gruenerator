/**
 * Presentation Theme — Grundlagendesign 2025
 *
 * Design tokens extracted from the official B90/Grüne PowerPoint template.
 * Canvas size is 1920×1080 (Full HD 16:9) for sharp rendering;
 * PPTX export maps to the standard 13.333×7.5 inch slide.
 */

import { SYSTEM_ASSETS } from '../../utils/canvasAssets';

// ============================================================================
// COLOR PALETTE
// ============================================================================

export const PRES_COLORS = {
  dk1: '#262628',
  lt1: '#F5F1E9',
  dk2: '#145E32',
  lt2: '#6CCD87',
  accent1: '#008938',
  accent2: '#8ABD24',
  accent3: '#0BA1DD',
  accent4: '#FFF179',
  accent5: '#E6007E',
  accent6: '#70AD47',
} as const;

export type PresentationColorMode = 'light' | 'dark';

export function getPresColors(mode: PresentationColorMode) {
  return mode === 'light'
    ? {
        background: PRES_COLORS.accent1,
        text: PRES_COLORS.lt1,
        subtitle: PRES_COLORS.lt1,
        footerText: PRES_COLORS.lt1,
        overlayBg: 'rgba(0, 137, 56, 0.65)',
      }
    : {
        background: PRES_COLORS.dk2,
        text: PRES_COLORS.lt1,
        subtitle: PRES_COLORS.lt2,
        footerText: PRES_COLORS.lt2,
        overlayBg: 'rgba(20, 94, 50, 0.70)',
      };
}

// ============================================================================
// LAYOUT CONSTANTS
// ============================================================================

export const PRES_CONFIG = {
  canvas: {
    width: 1920,
    height: 1080,
  },

  margins: {
    left: 90,
    right: 90,
    top: 80,
    bottom: 60,
  },

  contentWidth: 1740, // 1920 - 90 - 90

  // Title text
  title: {
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal' as const,
    fontSize: 120,
    minFontSize: 60,
    maxFontSize: 200,
    lineHeight: 1.1,
    maxWidth: 1400,
  },

  // Subtitle text
  subtitle: {
    fontFamily: 'PT Sans',
    fontStyle: 'normal' as const,
    fontSize: 36,
    minFontSize: 24,
    maxFontSize: 60,
    lineHeight: 1.4,
    maxWidth: 1400,
    gapFromTitle: 30,
  },

  // Body text (content slides)
  body: {
    fontFamily: 'PT Sans',
    fontStyle: 'normal' as const,
    fontSize: 32,
    minFontSize: 20,
    maxFontSize: 50,
    lineHeight: 1.5,
    maxWidth: 1740,
    gapFromTitle: 40,
  },

  // Footer
  footer: {
    height: 50,
    y: 1030, // 1080 - 50
    fontSize: 18,
    fontFamily: 'PT Sans',
  },

  // Sunflower decoration (bottom-right, partially off-canvas — matches PPTX positioning)
  sunflower: {
    src: SYSTEM_ASSETS.sunflower.green.src,
    size: 1200,
    x: 900,
    y: 100,
    opacity: 0.08,
  },
} as const;

export const PRES_BACKGROUND_COLORS = [
  { id: 'light', label: 'Grün', color: PRES_COLORS.accent1 },
  { id: 'dark', label: 'Dunkelgrün', color: PRES_COLORS.dk2 },
];

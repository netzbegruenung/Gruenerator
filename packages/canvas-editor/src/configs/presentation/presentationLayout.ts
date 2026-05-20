/**
 * Presentation Layout Calculators
 *
 * Each layout type (title, image, content) has its own calculator
 * that returns a LayoutResult with positioned elements + _meta colors.
 *
 * All calculators share the same PRES_CONFIG constants and adapt
 * element positions based on colorMode and text content.
 */

import { wrapTextAccurate } from '../../utils/textUtils';

import { PRES_CONFIG, getPresColors } from './presentationTheme';

import type { LayoutResult } from '../types';
import type { PresentationSlideState } from './presentationTypes';

// ============================================================================
// TITLE LAYOUT — "Nur Titel"
// ============================================================================

export function calculateTitleLayout(state: PresentationSlideState): LayoutResult {
  const colors = getPresColors(state.colorMode);
  const { margins, title, subtitle, sunflower } = PRES_CONFIG;

  const titleFontSize = state.customTitleFontSize ?? title.fontSize;
  const subtitleFontSize = state.customSubtitleFontSize ?? subtitle.fontSize;

  // Measure title to position subtitle below it
  const titleText = state.title || '';
  const titleLines = titleText
    ? wrapTextAccurate(titleText, title.maxWidth, titleFontSize, title.fontFamily, title.fontStyle)
    : [''];
  const titleBlockHeight = titleLines.length * titleFontSize * title.lineHeight;

  // Vertically center the title block in the upper 2/3 of the canvas
  const availableHeight =
    PRES_CONFIG.canvas.height - margins.top - PRES_CONFIG.footer.height - margins.bottom;
  const totalTextHeight =
    titleBlockHeight + subtitle.gapFromTitle + subtitleFontSize * subtitle.lineHeight;
  const titleY = margins.top + Math.max(0, (availableHeight - totalTextHeight) / 2);
  const subtitleY = titleY + titleBlockHeight + subtitle.gapFromTitle;

  return {
    'title-text': {
      x: margins.left,
      y: titleY,
      fontSize: titleFontSize,
      width: title.maxWidth,
    },
    'subtitle-text': {
      x: margins.left,
      y: subtitleY,
      fontSize: subtitleFontSize,
      width: subtitle.maxWidth,
    },
    sunflower: {
      x: sunflower.x,
      y: sunflower.y,
      width: sunflower.size,
      height: sunflower.size,
    },
    'footer-date': {
      x: margins.left,
      y: PRES_CONFIG.footer.y,
      fontSize: PRES_CONFIG.footer.fontSize,
    },
    'footer-custom': {
      x: PRES_CONFIG.canvas.width / 2,
      y: PRES_CONFIG.footer.y,
      fontSize: PRES_CONFIG.footer.fontSize,
    },
    'footer-number': {
      x: PRES_CONFIG.canvas.width - margins.right,
      y: PRES_CONFIG.footer.y,
      fontSize: PRES_CONFIG.footer.fontSize,
    },
    _meta: {
      colors,
      backgroundColor: colors.background,
      titleColor: colors.text,
      subtitleColor: colors.subtitle,
      footerColor: colors.footerText,
    },
  };
}

// ============================================================================
// IMAGE LAYOUT — "Bild mit Überschrift"
// ============================================================================

export function calculateImageLayout(state: PresentationSlideState): LayoutResult {
  const colors = getPresColors(state.colorMode);
  const { margins, title, subtitle } = PRES_CONFIG;

  const titleFontSize = state.customTitleFontSize ?? title.fontSize;
  const subtitleFontSize = state.customSubtitleFontSize ?? subtitle.fontSize;

  // Title positioned in the left-center area over the image
  const titleY = margins.top + 80;
  const subtitleY = titleY + titleFontSize * title.lineHeight * 2 + subtitle.gapFromTitle;

  return {
    'background-image': {
      x: 0,
      y: 0,
      width: PRES_CONFIG.canvas.width,
      height: PRES_CONFIG.canvas.height,
    },
    'overlay-rect': {
      x: 0,
      y: 0,
      width: PRES_CONFIG.canvas.width,
      height: PRES_CONFIG.canvas.height,
    },
    'title-text': {
      x: margins.left,
      y: titleY,
      fontSize: titleFontSize,
      width: title.maxWidth,
    },
    'subtitle-text': {
      x: margins.left,
      y: subtitleY,
      fontSize: subtitleFontSize,
      width: subtitle.maxWidth,
    },
    'footer-date': {
      x: margins.left,
      y: PRES_CONFIG.footer.y,
      fontSize: PRES_CONFIG.footer.fontSize,
    },
    'footer-custom': {
      x: PRES_CONFIG.canvas.width / 2,
      y: PRES_CONFIG.footer.y,
      fontSize: PRES_CONFIG.footer.fontSize,
    },
    'footer-number': {
      x: PRES_CONFIG.canvas.width - margins.right,
      y: PRES_CONFIG.footer.y,
      fontSize: PRES_CONFIG.footer.fontSize,
    },
    _meta: {
      colors,
      backgroundColor: colors.background,
      titleColor: '#FFFFFF',
      subtitleColor: '#FFFFFF',
      footerColor: '#FFFFFF',
      overlayColor: colors.overlayBg,
    },
  };
}

// ============================================================================
// CONTENT LAYOUT — "Inhalt mit Titel"
// ============================================================================

export function calculateContentLayout(state: PresentationSlideState): LayoutResult {
  const colors = getPresColors(state.colorMode);
  const { margins, title, body } = PRES_CONFIG;

  const titleFontSize = state.customTitleFontSize ?? 80; // Smaller title for content slides
  const bodyFontSize = state.customBodyFontSize ?? body.fontSize;
  const body2FontSize = state.customBody2FontSize ?? body.fontSize;

  const titleY = margins.top;
  const bodyY = titleY + titleFontSize * title.lineHeight + body.gapFromTitle;

  // Two-column mode when bodyText2 has content
  const hasTwoColumns = !!state.bodyText2;
  const columnWidth = hasTwoColumns
    ? (PRES_CONFIG.contentWidth - 60) / 2 // 60px gap between columns
    : PRES_CONFIG.contentWidth;
  const col2X = margins.left + columnWidth + 60;

  return {
    'title-text': {
      x: margins.left,
      y: titleY,
      fontSize: titleFontSize,
      width: PRES_CONFIG.contentWidth,
    },
    'body-text': {
      x: margins.left,
      y: bodyY,
      fontSize: bodyFontSize,
      width: columnWidth,
    },
    'body2-text': {
      x: col2X,
      y: bodyY,
      fontSize: body2FontSize,
      width: columnWidth,
    },
    'footer-date': {
      x: margins.left,
      y: PRES_CONFIG.footer.y,
      fontSize: PRES_CONFIG.footer.fontSize,
    },
    'footer-custom': {
      x: PRES_CONFIG.canvas.width / 2,
      y: PRES_CONFIG.footer.y,
      fontSize: PRES_CONFIG.footer.fontSize,
    },
    'footer-number': {
      x: PRES_CONFIG.canvas.width - margins.right,
      y: PRES_CONFIG.footer.y,
      fontSize: PRES_CONFIG.footer.fontSize,
    },
    _meta: {
      colors,
      backgroundColor: colors.background,
      titleColor: colors.text,
      bodyColor: colors.text,
      body2Color: colors.text,
      footerColor: colors.footerText,
      hasTwoColumns,
    },
  };
}

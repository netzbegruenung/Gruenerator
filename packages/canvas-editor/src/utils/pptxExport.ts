/**
 * PPTX Export Utility
 *
 * Converts presentation slide state into a native, editable PPTX file
 * using pptxgenjs. Maximizes editability in PowerPoint:
 *
 * - Text → native text boxes (editable font, size, color)
 * - Solid backgrounds → native fills
 * - Background images → embedded images
 * - Shapes (rect, circle, triangle, star) → native PPTX shapes
 * - Complex shapes (arrow, heart, cloud) → native custom geometry paths
 * - Circle badges → native ellipse + text box
 * - Pill badges → native rounded rect + text box
 * - Icons → rasterized PNG (SVG paths not extractable from Konva Image nodes)
 * - Sunflower decoration → embedded PNG image
 *
 * Coordinate mapping: Konva 1920×1080px → PPTX 13.333×7.5 inches
 */

// pptxgenjs is dynamically imported at runtime to keep it out of the main bundle.
// The type-only import gives us access to the PptxGenJS namespace for Slide, ShapeType, etc.
import type PptxGenJS from 'pptxgenjs';

type PptxInstance = PptxGenJS;

import { PRES_CONFIG, PRES_COLORS, getPresColors } from '../configs/presentation/presentationTheme';

import type { PresentationSlideState } from '../configs/presentation/presentationTypes';
import type { CanvasConfigId, HeterogeneousPage } from '../configs/types';
import type { ShapeInstance, ShapeType } from './shapes';
import type { CircleBadgeInstance } from '../primitives/CircleBadge';
import type { PillBadgeInstance } from './pillBadgeUtils';

// ============================================================================
// COORDINATE MAPPING
// ============================================================================

const PPTX_WIDTH = 13.333;
const PPTX_HEIGHT = 7.5;
const CANVAS_W = PRES_CONFIG.canvas.width;
const CANVAS_H = PRES_CONFIG.canvas.height;

function pxToInchX(px: number): number {
  return (px / CANVAS_W) * PPTX_WIDTH;
}

function pxToInchY(px: number): number {
  return (px / CANVAS_H) * PPTX_HEIGHT;
}

function fontSizePxToPt(px: number): number {
  return px * 0.75;
}

function hexToRgb(hex: string): string {
  return hex.replace('#', '');
}

// ============================================================================
// SHAPE TYPE MAPPING — Konva → pptxgenjs
// ============================================================================

const PPTX_SHAPE_MAP: Partial<Record<ShapeType, string>> = {
  rect: 'rect',
  circle: 'ellipse',
  triangle: 'triangle',
  star: 'star5',
};

// SVG path data from ShapePrimitive.tsx — normalized to a 100×100 viewbox
const SVG_PATHS: Partial<Record<ShapeType, { data: string; offsetX: number; offsetY: number }>> = {
  arrow: {
    data: 'M0,20 L50,20 L50,0 L100,50 L50,100 L50,80 L0,80 Z',
    offsetX: 50,
    offsetY: 50,
  },
  heart: {
    data: 'M50,90 C50,90 10,70 10,40 C10,15 30,5 50,30 C70,5 90,15 90,40 C90,70 50,90 50,90 Z',
    offsetX: 50,
    offsetY: 50,
  },
  cloud: {
    data: 'M25,60 C10,60 0,50 0,35 C0,20 15,10 25,15 C30,5 45,0 60,5 C75,10 80,20 80,25 C90,25 100,35 100,50 C100,65 85,75 70,70 C60,80 35,80 25,60 Z',
    offsetX: 50,
    offsetY: 40,
  },
};

/**
 * Parse an SVG path string into pptxgenjs point format.
 * Supports M, L, C, Q, Z commands (what our shapes use).
 */
function svgPathToPoints(
  pathData: string,
  scaleX: number,
  scaleY: number
): PptxGenJS.ShapeProps['points'] {
  const points: PptxGenJS.ShapeProps['points'] = [];
  const commands = pathData.match(/[MLCQZ][^MLCQZ]*/gi) || [];

  for (const cmd of commands) {
    const type = cmd[0].toUpperCase();
    const nums = cmd
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .map(Number);

    if (type === 'M') {
      points.push({ x: nums[0] * scaleX, y: nums[1] * scaleY, moveTo: true });
    } else if (type === 'L') {
      points.push({ x: nums[0] * scaleX, y: nums[1] * scaleY });
    } else if (type === 'C') {
      points.push({
        x: nums[4] * scaleX,
        y: nums[5] * scaleY,
        curve: {
          type: 'cubic',
          x1: nums[0] * scaleX,
          y1: nums[1] * scaleY,
          x2: nums[2] * scaleX,
          y2: nums[3] * scaleY,
        },
      });
    } else if (type === 'Q') {
      points.push({
        x: nums[2] * scaleX,
        y: nums[3] * scaleY,
        curve: {
          type: 'quadratic',
          x1: nums[0] * scaleX,
          y1: nums[1] * scaleY,
        },
      });
    } else if (type === 'Z') {
      points.push({ close: true });
    }
  }

  return points;
}

// ============================================================================
// PPTX GENERATION
// ============================================================================

export interface PptxExportOptions {
  title?: string;
  /** Fallback PNG for elements that can't be mapped natively (icons, illustrations) */
  decorationImages?: (string | null)[];
}

export async function exportSlidesToPptx(
  pages: HeterogeneousPage[],
  decorationImages: (string | null)[],
  options: PptxExportOptions = {}
): Promise<void> {
  const pptxgenModule = await import('pptxgenjs');
  const PptxGen = pptxgenModule.default;
  const pptx = new PptxGen();

  pptx.author = 'Grünerator';
  pptx.subject = 'Grundlagendesign 2025';
  pptx.title = options.title || 'Präsentation';
  pptx.layout = 'LAYOUT_16x9';

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const state = page.state as unknown as PresentationSlideState;
    const configId = page.configId;
    const decorationPng = decorationImages[i];

    addSlide(pptx, state, configId, i, decorationPng);
  }

  await pptx.writeFile({ fileName: `${options.title || 'Praesentation'}.pptx` });
}

function addSlide(
  pptx: PptxInstance,
  state: PresentationSlideState,
  configId: CanvasConfigId,
  slideIndex: number,
  decorationPng: string | null
): void {
  const slide = pptx.addSlide();
  const colors = getPresColors(state.colorMode);
  const isImageLayout = configId === 'pres-image';

  // --- Background ---
  if (isImageLayout && state.currentImageSrc) {
    if (state.currentImageSrc.startsWith('data:')) {
      slide.background = { data: state.currentImageSrc };
    } else {
      slide.background = { color: hexToRgb(colors.background) };
    }

    slide.addShape('rect', {
      x: 0,
      y: 0,
      w: PPTX_WIDTH,
      h: PPTX_HEIGHT,
      fill: { color: hexToRgb(PRES_COLORS.dk2), transparency: 35 },
    });
  } else {
    slide.background = { color: hexToRgb(state.backgroundColor || colors.background) };
  }

  // --- Native shapes from state ---
  addNativeShapes(slide, state);
  addNativeBadges(slide, state);

  // --- Fallback decoration PNG (icons, illustrations, sunflower — not yet natively mappable) ---
  if (decorationPng) {
    slide.addImage({
      data: decorationPng,
      x: 0,
      y: 0,
      w: PPTX_WIDTH,
      h: PPTX_HEIGHT,
    });
  }

  // --- Title text ---
  if (state.title) {
    const titleFontSize =
      state.customTitleFontSize ?? (configId === 'pres-content' ? 80 : PRES_CONFIG.title.fontSize);
    const titleColor = isImageLayout ? 'FFFFFF' : hexToRgb(colors.text);

    slide.addText(state.title, {
      x: pxToInchX(PRES_CONFIG.margins.left),
      y: pxToInchY(configId === 'pres-content' ? PRES_CONFIG.margins.top : 200),
      w: pxToInchX(PRES_CONFIG.title.maxWidth),
      h: pxToInchY(titleFontSize * PRES_CONFIG.title.lineHeight * 3),
      fontSize: fontSizePxToPt(titleFontSize),
      fontFace: 'GrueneType Neue',
      color: titleColor,
      valign: 'top',
      wrap: true,
      lineSpacingMultiple: PRES_CONFIG.title.lineHeight / 1.25,
    });
  }

  // --- Subtitle text ---
  if (state.subtitle && configId !== 'pres-content') {
    const subtitleFontSize = state.customSubtitleFontSize ?? PRES_CONFIG.subtitle.fontSize;
    const subtitleColor = isImageLayout ? 'FFFFFF' : hexToRgb(colors.subtitle);

    slide.addText(state.subtitle, {
      x: pxToInchX(PRES_CONFIG.margins.left),
      y: pxToInchY(500),
      w: pxToInchX(PRES_CONFIG.subtitle.maxWidth),
      h: pxToInchY(subtitleFontSize * PRES_CONFIG.subtitle.lineHeight * 3),
      fontSize: fontSizePxToPt(subtitleFontSize),
      fontFace: 'PT Sans',
      color: subtitleColor,
      valign: 'top',
      wrap: true,
    });
  }

  // --- Body text (content slides) ---
  if (configId === 'pres-content' && state.bodyText) {
    const bodyFontSize = state.customBodyFontSize ?? PRES_CONFIG.body.fontSize;
    const hasTwoColumns = !!state.bodyText2;
    const columnWidth = hasTwoColumns
      ? (PRES_CONFIG.contentWidth - 60) / 2
      : PRES_CONFIG.contentWidth;

    slide.addText(state.bodyText, {
      x: pxToInchX(PRES_CONFIG.margins.left),
      y: pxToInchY(200),
      w: pxToInchX(columnWidth),
      h: pxToInchY(700),
      fontSize: fontSizePxToPt(bodyFontSize),
      fontFace: 'PT Sans',
      color: hexToRgb(colors.text),
      valign: 'top',
      wrap: true,
      lineSpacingMultiple: PRES_CONFIG.body.lineHeight / 1.25,
    });

    if (state.bodyText2) {
      const col2X = PRES_CONFIG.margins.left + columnWidth + 60;
      slide.addText(state.bodyText2, {
        x: pxToInchX(col2X),
        y: pxToInchY(200),
        w: pxToInchX(columnWidth),
        h: pxToInchY(700),
        fontSize: fontSizePxToPt(state.customBody2FontSize ?? bodyFontSize),
        fontFace: 'PT Sans',
        color: hexToRgb(colors.text),
        valign: 'top',
        wrap: true,
        lineSpacingMultiple: PRES_CONFIG.body.lineHeight / 1.25,
      });
    }
  }

  // --- Footer ---
  addFooter(slide, state, slideIndex, isImageLayout, colors);
}

// ============================================================================
// NATIVE SHAPE EXPORT
// ============================================================================

function addNativeShapes(slide: PptxGenJS.Slide, state: PresentationSlideState): void {
  if (!state.shapeInstances?.length) return;

  for (const shape of state.shapeInstances as ShapeInstance[]) {
    const scaledW = shape.width * shape.scaleX;
    const scaledH = shape.height * shape.scaleY;
    // Konva uses center-point; PPTX uses top-left corner
    const x = pxToInchX(shape.x - scaledW / 2);
    const y = pxToInchY(shape.y - scaledH / 2);
    const w = pxToInchX(scaledW);
    const h = pxToInchY(scaledH);

    const fillColor = hexToRgb(shape.fill);
    const transparency = (1 - shape.opacity) * 100;

    // Check if this is a simple shape with a native pptxgenjs equivalent
    const nativeType = PPTX_SHAPE_MAP[shape.type];

    if (nativeType) {
      slide.addShape(nativeType as PptxGenJS.ShapeType, {
        x,
        y,
        w,
        h,
        fill: { color: fillColor, transparency },
        rotate: shape.rotation,
      });
    } else {
      // Complex path shapes — convert SVG path to pptxgenjs custom geometry
      const pathInfo = SVG_PATHS[shape.type];
      if (pathInfo) {
        const scaleFactorX = pxToInchX(scaledW) / pxToInchX(100);
        const scaleFactorY = pxToInchY(scaledH) / pxToInchY(100);
        const points = svgPathToPoints(pathInfo.data, scaleFactorX, scaleFactorY);

        slide.addShape('custGeom' as PptxGenJS.ShapeType, {
          x,
          y,
          w,
          h,
          fill: { color: fillColor, transparency },
          rotate: shape.rotation,
          points,
        });
      }
    }
  }
}

// ============================================================================
// NATIVE BADGE EXPORT
// ============================================================================

function addNativeBadges(slide: PptxGenJS.Slide, state: PresentationSlideState): void {
  // Circle badges → native ellipse + text
  if (state.circleBadgeInstances?.length) {
    for (const badge of state.circleBadgeInstances as CircleBadgeInstance[]) {
      const scaledRadius = badge.radius * badge.scale;
      const diameter = scaledRadius * 2;
      const x = pxToInchX(badge.x - scaledRadius);
      const y = pxToInchY(badge.y - scaledRadius);
      const w = pxToInchX(diameter);
      const h = pxToInchY(diameter);

      slide.addShape('ellipse' as PptxGenJS.ShapeType, {
        x,
        y,
        w,
        h,
        fill: { color: hexToRgb(badge.backgroundColor), transparency: (1 - (badge.opacity ?? 1)) * 100 },
        rotate: badge.rotation,
      });

      // Add text lines as a single text box overlaid on the circle
      if (badge.textLines?.length) {
        const textContent = badge.textLines.map((line) => line.text).join('\n');
        const primaryLine = badge.textLines[0];

        slide.addText(textContent, {
          x,
          y,
          w,
          h,
          fontSize: fontSizePxToPt(primaryLine.fontSize * badge.scale),
          fontFace: primaryLine.fontFamily || 'PT Sans',
          color: hexToRgb(badge.textColor),
          align: 'center',
          valign: 'middle',
          wrap: true,
          rotate: badge.rotation,
        });
      }
    }
  }

  // Pill badges → native rounded rect + text
  if (state.pillBadgeInstances?.length) {
    for (const badge of state.pillBadgeInstances as PillBadgeInstance[]) {
      const textWidth = badge.text.length * badge.fontSize * 0.6;
      const badgeW = textWidth + badge.paddingX * 2;
      const badgeH = badge.fontSize + badge.paddingY * 2;
      const scaledW = badgeW * badge.scale;
      const scaledH = badgeH * badge.scale;
      const x = pxToInchX(badge.x);
      const y = pxToInchY(badge.y);
      const w = pxToInchX(scaledW);
      const h = pxToInchY(scaledH);

      slide.addShape('roundRect' as PptxGenJS.ShapeType, {
        x,
        y,
        w,
        h,
        fill: { color: hexToRgb(badge.backgroundColor), transparency: (1 - (badge.opacity ?? 1)) * 100 },
        rectRadius: pxToInchX(badge.cornerRadius * badge.scale),
        rotate: badge.rotation,
      });

      slide.addText(badge.text, {
        x,
        y,
        w,
        h,
        fontSize: fontSizePxToPt(badge.fontSize * badge.scale),
        fontFace: badge.fontFamily || 'GrueneTypeNeue',
        color: hexToRgb(badge.textColor),
        align: 'center',
        valign: 'middle',
        bold: badge.fontStyle === 'bold' || badge.fontStyle === 'bold italic',
        italic: badge.fontStyle === 'italic' || badge.fontStyle === 'bold italic',
        rotate: badge.rotation,
      });
    }
  }
}

// ============================================================================
// FOOTER
// ============================================================================

function addFooter(
  slide: PptxGenJS.Slide,
  state: PresentationSlideState,
  slideIndex: number,
  isImageLayout: boolean,
  colors: ReturnType<typeof getPresColors>
): void {
  const footerY = pxToInchY(PRES_CONFIG.footer.y);
  const footerFontSize = fontSizePxToPt(PRES_CONFIG.footer.fontSize);
  const footerColor = isImageLayout ? 'FFFFFF' : hexToRgb(colors.footerText);

  if (state.footerDate) {
    slide.addText(state.footerDate, {
      x: pxToInchX(PRES_CONFIG.margins.left),
      y: footerY,
      w: pxToInchX(400),
      h: 0.3,
      fontSize: footerFontSize,
      fontFace: 'PT Sans',
      color: footerColor,
      valign: 'middle',
    });
  }

  if (state.footerCustomText) {
    slide.addText(state.footerCustomText, {
      x: PPTX_WIDTH / 2 - pxToInchX(300),
      y: footerY,
      w: pxToInchX(600),
      h: 0.3,
      fontSize: footerFontSize,
      fontFace: 'PT Sans',
      color: footerColor,
      align: 'center',
      valign: 'middle',
    });
  }

  if (state.showSlideNumber) {
    slide.addText(String(slideIndex + 1), {
      x: PPTX_WIDTH - pxToInchX(PRES_CONFIG.margins.right) - pxToInchX(80),
      y: footerY,
      w: pxToInchX(80),
      h: 0.3,
      fontSize: footerFontSize,
      fontFace: 'PT Sans',
      color: footerColor,
      align: 'right',
      valign: 'middle',
    });
  }
}

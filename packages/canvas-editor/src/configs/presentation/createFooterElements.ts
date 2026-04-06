/**
 * Footer Elements Factory
 *
 * Creates the 3 footer text elements (date, custom text, slide number)
 * shared across all presentation slide layouts.
 * Positioned at the bottom of the canvas, color adapts to colorMode.
 */

import { PRES_CONFIG } from './presentationTheme';

import type { TextElementConfig } from '../types';
import type { PresentationSlideState } from './presentationTypes';

export function createFooterElements(
  startOrder: number
): TextElementConfig<PresentationSlideState>[] {
  const footerDateElement: TextElementConfig<PresentationSlideState> = {
    id: 'footer-date',
    type: 'text',
    x: (_s, l) => (l['footer-date'] as { x?: number })?.x ?? PRES_CONFIG.margins.left,
    y: (_s, l) => (l['footer-date'] as { y?: number })?.y ?? PRES_CONFIG.footer.y,
    order: startOrder,
    textKey: 'footerDate',
    width: 400,
    fontSize: PRES_CONFIG.footer.fontSize,
    fontFamily: `${PRES_CONFIG.footer.fontFamily}, Calibri, sans-serif`,
    align: 'left',
    lineHeight: 1.2,
    wrap: 'none',
    editable: false,
    fill: (_s, l) => (l._meta as { footerColor?: string })?.footerColor ?? '#F5F1E9',
    visible: (state) => !!state.footerDate,
  };

  const footerCustomElement: TextElementConfig<PresentationSlideState> = {
    id: 'footer-custom',
    type: 'text',
    x: (_s, l) => (l['footer-custom'] as { x?: number })?.x ?? PRES_CONFIG.canvas.width / 2,
    y: (_s, l) => (l['footer-custom'] as { y?: number })?.y ?? PRES_CONFIG.footer.y,
    order: startOrder + 1,
    textKey: 'footerCustomText',
    width: 600,
    fontSize: PRES_CONFIG.footer.fontSize,
    fontFamily: `${PRES_CONFIG.footer.fontFamily}, Calibri, sans-serif`,
    align: 'center',
    lineHeight: 1.2,
    wrap: 'none',
    editable: false,
    fill: (_s, l) => (l._meta as { footerColor?: string })?.footerColor ?? '#F5F1E9',
    visible: (state) => !!state.footerCustomText,
  };

  const footerNumberElement: TextElementConfig<PresentationSlideState> = {
    id: 'footer-number',
    type: 'text',
    x: (_s, l) =>
      ((l['footer-number'] as { x?: number })?.x ?? PRES_CONFIG.canvas.width - PRES_CONFIG.margins.right) - 40,
    y: (_s, l) => (l['footer-number'] as { y?: number })?.y ?? PRES_CONFIG.footer.y,
    order: startOrder + 2,
    textKey: 'slideNumber',
    width: 80,
    fontSize: PRES_CONFIG.footer.fontSize,
    fontFamily: `${PRES_CONFIG.footer.fontFamily}, Calibri, sans-serif`,
    align: 'right',
    lineHeight: 1.2,
    wrap: 'none',
    editable: false,
    fill: (_s, l) => (l._meta as { footerColor?: string })?.footerColor ?? '#F5F1E9',
    visible: (state) => state.showSlideNumber,
  };

  return [footerDateElement, footerCustomElement, footerNumberElement];
}

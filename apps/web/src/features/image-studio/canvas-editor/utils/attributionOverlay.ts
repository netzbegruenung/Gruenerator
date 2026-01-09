/**
 * Attribution Overlay for Canvas Exports
 *
 * Handles rendering attribution on canvas exports per Unsplash API guidelines.
 * Attribution only renders during export, not in the editor UI.
 */

import type { StockImageAttribution } from '../../../services/imageSourceService';

export interface AttributionRenderData {
  text: string;
  x: number;
  y: number;
  fontSize: number;
  backgroundColor: string;
  textColor: string;
  padding: number;
}

/**
 * Calculate attribution overlay position and styling
 *
 * @param attribution - Stock image attribution data
 * @param canvasWidth - Canvas width in pixels
 * @param canvasHeight - Canvas height in pixels
 * @param position - Overlay position (default: bottom-right)
 * @param fontSize - Font size for attribution text (default: 10)
 * @returns Render data for the overlay, or null if no attribution needed
 */
export function calculateAttributionOverlay(
  attribution: StockImageAttribution | null,
  canvasWidth: number,
  canvasHeight: number,
  position: 'bottom-right' | 'bottom-left' | 'bottom-center' = 'bottom-right',
  fontSize: number = 10
): AttributionRenderData | null {
  if (!attribution?.photographer) {
    return null; // No attribution needed
  }

  const text = `Foto: ${attribution.photographer}`;
  const padding = 8;

  // Estimate text width (rough approximation, Konva will handle actual rendering)
  const estimatedWidth = text.length * fontSize * 0.6 + padding * 2;

  let x: number;
  let y: number;

  switch (position) {
    case 'bottom-left':
      x = padding;
      y = canvasHeight - fontSize - padding * 2;
      break;
    case 'bottom-center':
      x = (canvasWidth - estimatedWidth) / 2;
      y = canvasHeight - fontSize - padding * 2;
      break;
    case 'bottom-right':
    default:
      x = canvasWidth - estimatedWidth;
      y = canvasHeight - fontSize - padding * 2;
      break;
  }

  return {
    text,
    x,
    y,
    fontSize,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    textColor: '#ffffff',
    padding,
  };
}

/**
 * Dreizeilen Canvas Constants
 *
 * Extracted configuration values and defaults for the Dreizeilen canvas.
 * These constants replace hardcoded values scattered throughout the original component.
 */

export const SNAP_GUIDE_CONFIG = {
  color: '#0066ff',
  strokeWidth: 2,
  dash: [5, 5] as [number, number],
  padding: 4,
} as const;

export const ADDITIONAL_TEXT_DEFAULTS = {
  header: {
    defaultText: 'Neue Überschrift',
    fontSize: 60,
    fontStyle: 'bold' as const,
    offsetY: 0,
    width: 400,
  },
  body: {
    defaultText: 'Neuer Text',
    fontSize: 30,
    fontStyle: 'normal' as const,
    offsetY: 100,
    width: 400,
  },
} as const;

export const ICON_DEFAULTS = {
  x: (canvasWidth: number) => canvasWidth / 2,
  y: (canvasHeight: number) => canvasHeight / 2,
  scale: 1,
  rotation: 0,
  color: '#005538',
  opacity: 1,
} as const;

export const SHAPE_DEFAULTS = {
  x: (canvasWidth: number) => canvasWidth / 2,
  y: (canvasHeight: number) => canvasHeight / 2,
  fill: '#005538',
} as const;

export const BALKEN_TRANSFORMER_CONFIG = {
  minSize: 100,
  maxSize: 2000,
  enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const,
  keepRatio: true,
} as const;

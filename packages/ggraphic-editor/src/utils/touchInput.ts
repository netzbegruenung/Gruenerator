// SPDX-License-Identifier: MPL-2.0
import type Konva from 'konva';

export const MOUSE_DRAG_DISTANCE = 3;
// A resting fingertip rolls several pixels; below this a press stays a tap.
export const TOUCH_DRAG_DISTANCE = 8;

// Anchors stay 10 px visually; the extra hit stroke brings the touch target
// to ~44 px.
const TOUCH_ANCHOR_HIT_STROKE = 34;

const isCoarsePointer = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

/** Finger statt Maus, einmal beim Laden des Moduls bestimmt. */
export const COARSE_POINTER = isCoarsePointer();

// Konva skips its anchor layout cache whenever `anchorStyleFunc` is set and
// overrides its own touch-aware hitStrokeWidth, so fine pointers get none.
// Resolved once at module load; undefined when absent.
export const touchAnchorStyleFunc: ((anchor: Konva.Rect) => void) | undefined = COARSE_POINTER
  ? (anchor) => anchor.hitStrokeWidth(TOUCH_ANCHOR_HIT_STROKE)
  : undefined;

// A touch that ends further away than this scrolled or dragged; it was not a tap.
export const TOUCH_TAP_SLOP = 10;

// SPDX-License-Identifier: MPL-2.0
/**
 * Rahmen: eine Form, die ein Bild beschneidet.
 */

export type FrameClipType =
  | 'circle'
  | 'rounded-rect'
  | 'square'
  | 'oval'
  | 'hexagon'
  | 'diamond'
  | 'drop'
  | 'leaf'
  | 'star'
  | 'heart'
  | 'cloud'
  | 'blob'
  | 'arch'
  | 'octagon'
  | 'pentagon'
  | 'triangle'
  | 'speech-bubble'
  | 'banner-tag'
  | 'ring'
  | 'ribbon';

/**
 * Display category for the Rahmen palette. Each clip-type belongs to exactly
 * one category; the Elemente catalogue orders the frames by it.
 */
export type FrameCategory = 'geometric' | 'soft' | 'organic' | 'stars' | 'speech' | 'banners';

export interface FrameInstance {
  id: string;
  clipType: FrameClipType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  imageSrc: string | null;
  imageOffsetX: number;
  imageOffsetY: number;
  imageScale: number;
  borderColor: string;
  borderWidth: number;
  cornerRadius: number;
  // --- Phase 1d schema groundwork (no UI yet; defaults are inert) ---
  // Border styling (Phase 2)
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double';
  borderDash?: number[];
  // Drop shadow (Phase 3)
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  // Polaroid (Phase 4)
  caption?: string;
  tilt?: number;
  // Aspect-ratio lock (Phase 5)
  aspectRatioLock?: number;
}

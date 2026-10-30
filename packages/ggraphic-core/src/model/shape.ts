// SPDX-License-Identifier: MPL-2.0
/**
 * Formen auf der Seite. Der Mittelpunkt ist (x, y).
 */
import { type GradientFill } from './fill.js';

export type ShapeType =
  | 'rect'
  | 'circle'
  | 'triangle'
  | 'star'
  | 'arrow'
  | 'heart'
  | 'cloud'
  | 'hexagon'
  | 'pentagon'
  | 'diamond'
  | 'ellipse'
  | 'rounded-rect'
  | 'ring'
  | 'chevron'
  | 'double-arrow'
  | 'wavy'
  | 'speech-round'
  | 'speech-rect'
  | 'sparkle'
  | 'checkmark'
  | 'blob'
  | 'leaf'
  | 'line'
  | 'line-thick'
  | 'line-dashed'
  | 'line-dotted'
  | 'line-double'
  | 'line-arrow'
  | 'speech-cloud'
  | 'speech-pointed'
  | 'cloud-fluffy'
  | 'cloud-puff'
  | 'cloud-thin'
  | 'heart-broken'
  | 'heart-double'
  | 'heart-arrow'
  | 'drop'
  | 'drop-pin'
  | 'drop-tear'
  | 'drop-flame'
  | 'banner-ribbon'
  | 'banner-flag'
  | 'banner-tag'
  | 'banner-scroll'
  | 'gear'
  | 'gear-12'
  | 'gear-6'
  | 'gear-fine'
  | 'asterisk'
  | 'star-burst'
  | 'flower'
  | 'flower-8'
  | 'blob-2'
  | 'tree'
  | 'mountain'
  | 'sun'
  | 'plus'
  | 'minus'
  | 'x-mark'
  | 'arrow-curved'
  | 'hand-kreis'
  | 'hand-unterstrich'
  | 'hand-pfeil'
  | 'hand-ausruf'
  | 'hand-marker'
  | 'hand-marker-box'
  | 'hand-winken'
  | 'hand-pfeil-schlaufe'
  | 'hand-pfeil-welle'
  | 'hand-pfeil-bogen'
  | 'hand-pfeil-haken'
  | 'hand-pfeil-herz'
  | 'hand-pfeil-spirale';

/** `color`: hue and saturation of the fill, brightness of what lies beneath — a duotone. */
export type ShapeBlendMode = 'color';

export interface ShapeInstance {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  cornerRadius?: number;
  /** Canvas px a composer card grew with its text (cardFollowsText); not a hand resize. */
  textGrowth?: number;
  strokeWidth?: number;
  dash?: number[];
  /** Drop shadow (Konva shadow* props); omit for no shadow. */
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowOpacity?: number;
  /** Linear gradient fill; when set, overrides `fill`. */
  fillGradient?: GradientFill | null;
  /** Blends the fill into what lies beneath (Konva `globalCompositeOperation`); omit for normal. */
  blendMode?: ShapeBlendMode;
  /** Mirrored about the centre (negative node scale); omit for upright. */
  flipX?: boolean;
  flipY?: boolean;
}

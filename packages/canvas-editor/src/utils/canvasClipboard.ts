/**
 * Canvas Clipboard - Singleton for copy/paste operations
 *
 * Manages a session-level clipboard for canvas elements (shapes, balkens, icons, etc.)
 * Enables copy (Ctrl+C) and paste (Ctrl+V) functionality across canvas instances.
 *
 * `ClipboardItem` is a discriminated union: each `type` literal maps to its
 * specific data shape, so paste-side branches narrow `data` automatically
 * without unsafe casts.
 */

import type { AdditionalText } from '../configs/types';
import type { BalkenInstance } from '../primitives/BalkenGroup';
import type { AssetInstance } from './canvasAssets';
import type { CircleBadgeInstance } from './circleBadgeUtils';
import type { FrameInstance } from './frameUtils';
import type { IllustrationInstance } from './illustrations/types';
import type { PillBadgeInstance } from './pillBadgeUtils';
import type { ShapeInstance } from './shapes';
import type { UserImageInstance } from './userImageUtils';

export type ClipboardItemType =
  | 'balken'
  | 'shape'
  | 'illustration'
  | 'additional-text'
  | 'asset'
  | 'pill-badge'
  | 'circle-badge'
  | 'frame'
  | 'user-image';

/**
 * Per-type payload shape stored on the clipboard. Each consumer that copies a
 * value must satisfy its entry; the paste site narrows on `type` to recover
 * the precise shape — no `as { x: number; y: number }` needed downstream.
 */
export interface ClipboardDataMap {
  balken: BalkenInstance;
  shape: ShapeInstance;
  illustration: IllustrationInstance;
  'additional-text': AdditionalText;
  asset: AssetInstance;
  'pill-badge': PillBadgeInstance;
  'circle-badge': CircleBadgeInstance;
  frame: FrameInstance;
  'user-image': UserImageInstance;
}

export type ClipboardEntry = {
  [K in ClipboardItemType]: { type: K; data: ClipboardDataMap[K] };
}[ClipboardItemType];

export class CanvasClipboard {
  private static instance: ClipboardEntry | null = null;

  static copy<T extends ClipboardItemType>(type: T, data: ClipboardDataMap[T]): void {
    CanvasClipboard.instance = { type, data } as ClipboardEntry;
  }

  /**
   * Paste the clipboard contents (returns null if empty).
   * Callers should narrow on `result.type` to access `result.data` safely.
   */
  static paste(): ClipboardEntry | null {
    return CanvasClipboard.instance;
  }

  /**
   * Clear the clipboard
   */
  static clear(): void {
    CanvasClipboard.instance = null;
  }

  /**
   * Check if clipboard has content
   */
  static hasContent(): boolean {
    return CanvasClipboard.instance !== null;
  }
}

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

import type { AssetInstance } from './canvasAssets';
import type { CircleBadgeInstance } from './circleBadgeUtils';
import type { FrameInstance } from './frameUtils';
import type { IllustrationInstance } from './illustrations/types';
import type { PillBadgeInstance } from './pillBadgeUtils';
import type { ShapeInstance } from './shapes';
import type { UserImageInstance } from './userImageUtils';
import type { BalkenInstance } from '../primitives';
import type { AdditionalText } from '../configs/types';

export type ClipboardItem =
  | { type: 'shape'; data: ShapeInstance }
  | { type: 'illustration'; data: IllustrationInstance }
  | { type: 'balken'; data: BalkenInstance }
  | { type: 'additional-text'; data: AdditionalText }
  | { type: 'asset'; data: AssetInstance }
  | { type: 'pill-badge'; data: PillBadgeInstance }
  | { type: 'frame'; data: FrameInstance }
  | { type: 'user-image'; data: UserImageInstance }
  | { type: 'circle-badge'; data: CircleBadgeInstance };

export type ClipboardItemType = ClipboardItem['type'];

export class CanvasClipboard {
  private static instance: ClipboardItem | null = null;

  static copy(type: 'shape', data: ShapeInstance): void;
  static copy(type: 'illustration', data: IllustrationInstance): void;
  static copy(type: 'balken', data: BalkenInstance): void;
  static copy(type: 'additional-text', data: AdditionalText): void;
  static copy(type: 'asset', data: AssetInstance): void;
  static copy(type: 'pill-badge', data: PillBadgeInstance): void;
  static copy(type: 'frame', data: FrameInstance): void;
  static copy(type: 'user-image', data: UserImageInstance): void;
  static copy(type: 'circle-badge', data: CircleBadgeInstance): void;
  static copy(type: ClipboardItemType, data: ClipboardItem['data']): void {
    // The overloads above guarantee (type, data) is a valid discriminated
    // pair; the implementation signature widens to the union for storage.
    CanvasClipboard.instance = { type, data } as ClipboardItem;
  }

  /**
   * Paste the clipboard contents (returns null if empty).
   * Callers should narrow on `result.type` to access `result.data` safely.
   */
  static paste(): ClipboardItem | null {
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

/**
 * Canvas Clipboard - Singleton for copy/paste operations
 *
 * Manages a session-level clipboard for canvas elements (shapes, balkens, icons, etc.)
 * Enables copy (Ctrl+C) and paste (Ctrl+V) functionality across canvas instances.
 *
 * Die Typtabelle steht nicht hier, sondern in `duplicateElement.ts`: Kopieren,
 * Einfügen und Duplizieren betreffen dieselben Elementarten, und zwei Listen
 * gingen erwartbar auseinander — genau das war vorher der Fall, `chart` fehlte
 * hier, während Strg+D es konnte.
 */

import {
  type DuplicableDataMap,
  type DuplicableEntry,
  type DuplicableType,
} from './duplicateElement';

export type ClipboardItemType = DuplicableType;
export type ClipboardDataMap = DuplicableDataMap;
export type ClipboardEntry = DuplicableEntry;

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

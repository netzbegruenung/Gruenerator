// SPDX-License-Identifier: MPL-2.0
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
} from './duplicateElement.js';

export type ClipboardItemType = DuplicableType;
export type ClipboardDataMap = DuplicableDataMap;
export type ClipboardEntry = DuplicableEntry;

/**
 * Eine kopierte Auswahl. `bounds` ist ihre Box in Vorlagen-Koordinaten, beim
 * Kopieren gemessen — „Hier einfügen“ legt deren linke obere Ecke an den
 * Zeiger. `null`, wenn sich nichts messen ließ; dann gilt der feste Versatz.
 */
export interface ClipboardContent {
  readonly entries: readonly ClipboardEntry[];
  readonly bounds: { x: number; y: number; width: number; height: number } | null;
}

export class CanvasClipboard {
  private static content: ClipboardContent | null = null;

  static copy(content: ClipboardContent): void {
    CanvasClipboard.content = content.entries.length > 0 ? content : null;
  }

  /**
   * Paste the clipboard contents (returns null if empty).
   * Callers should narrow on `entry.type` to access `entry.data` safely.
   */
  static paste(): ClipboardContent | null {
    return CanvasClipboard.content;
  }

  /**
   * Clear the clipboard
   */
  static clear(): void {
    CanvasClipboard.content = null;
  }

  /**
   * Check if clipboard has content
   */
  static hasContent(): boolean {
    return CanvasClipboard.content !== null;
  }
}

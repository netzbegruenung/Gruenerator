/**
 * Canvas Clipboard - Singleton for copy/paste operations
 *
 * Manages a session-level clipboard for canvas elements (shapes, balkens, icons, etc.)
 * Enables copy (Ctrl+C) and paste (Ctrl+V) functionality across canvas instances.
 */

export type ClipboardItemType = 'balken' | 'shape' | 'illustration' | 'additional-text' | 'asset';

export interface ClipboardItem {
  type: ClipboardItemType;
  data: Record<string, unknown>;
}

export class CanvasClipboard {
  private static instance: ClipboardItem | null = null;

  static copy(type: ClipboardItemType, data: object): void {
    CanvasClipboard.instance = { type, data: data as Record<string, unknown> };
  }

  /**
   * Paste the clipboard contents (returns null if empty)
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

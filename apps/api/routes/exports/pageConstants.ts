/**
 * Server-side format registry (sharepic-only).
 *
 * The full format registry lives in `packages/canvas-editor/src/formats/index.ts`
 * and drives the frontend UI. This file mirrors the server-known format ids — no
 * react-konva, no react. Keep in sync when the registry is changed.
 */

export interface CanvasFormatLite {
  id: string;
  category: 'digital';
  width: number; // pixels
  height: number; // pixels
  dpi: number;
}

/**
 * Format-id → server-known dimensions. Matches packages/canvas-editor/src/formats/index.ts.
 */
export const SERVER_FORMATS: Readonly<Record<string, CanvasFormatLite>> = {
  'post-portrait': {
    id: 'post-portrait',
    category: 'digital',
    width: 1080,
    height: 1350,
    dpi: 72,
  },
};

export function getServerFormat(id: string): CanvasFormatLite | null {
  return SERVER_FORMATS[id] ?? null;
}

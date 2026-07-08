export type CanvasFormatCategory = 'digital';

/**
 * UI-level grouping shown as section headers on the /studio page.
 * Sharepic is the only supported output format.
 */
export type CanvasFormatGroup = 'sharepic';

export type CanvasFormatIconKey = 'portrait';

export type CanvasExportType = 'png' | 'jpeg';

export interface CanvasFormat {
  id: string;
  label: string;
  description: string;
  group: CanvasFormatGroup;
  category: CanvasFormatCategory;
  width: number;
  height: number;
  dpi: number;
  iconKey: CanvasFormatIconKey;
  defaultExport: CanvasExportType;
  exportable: ReadonlyArray<CanvasExportType>;
}

export const CANVAS_FORMAT_GROUP_LABEL: Record<CanvasFormatGroup, string> = {
  sharepic: 'Sharepics',
};

export const CANVAS_FORMAT_GROUP_ORDER: ReadonlyArray<CanvasFormatGroup> = ['sharepic'];

export const CANVAS_FORMATS: ReadonlyArray<CanvasFormat> = [
  // ── Sharepics ────────────────────────────────────────────────────────────
  // The sharepic design (1080×1350) is the only supported output format.
  {
    id: 'post-portrait',
    label: 'Sharepic',
    description: '1080 × 1350 · 4:5 · Instagram, Facebook',
    group: 'sharepic',
    category: 'digital',
    width: 1080,
    height: 1350,
    dpi: 72,
    iconKey: 'portrait',
    defaultExport: 'png',
    exportable: ['png', 'jpeg'],
  },
];

export const DEFAULT_FORMAT_ID = 'post-portrait';

export function getCanvasFormat(id: string): CanvasFormat | null {
  return CANVAS_FORMATS.find((f) => f.id === id) ?? null;
}

export function getCanvasFormatOrDefault(id: string | null | undefined): CanvasFormat {
  if (id) {
    const found = getCanvasFormat(id);
    if (found) return found;
  }
  const fallback = getCanvasFormat(DEFAULT_FORMAT_ID);
  if (!fallback) {
    throw new Error(`CANVAS_FORMATS missing default '${DEFAULT_FORMAT_ID}'`);
  }
  return fallback;
}

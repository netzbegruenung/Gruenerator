export type CanvasFormatCategory = 'digital';

/**
 * UI-level grouping shown as section headers on the /studio page. 3:4 is its
 * own group because only freeform lays out on it; the templates stay 4:5.
 * The square belongs to the profile picture alone.
 */
export type CanvasFormatGroup = 'sharepic' | 'sharepic-tall' | 'profilbild';

export type CanvasFormatIconKey = 'portrait' | 'square';

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
  'sharepic-tall': 'Sharepics 3:4',
  profilbild: 'Profilbild',
};

export const CANVAS_FORMAT_GROUP_ORDER: ReadonlyArray<CanvasFormatGroup> = [
  'sharepic',
  'sharepic-tall',
  'profilbild',
];

export const CANVAS_FORMATS: ReadonlyArray<CanvasFormat> = [
  // ── Sharepics ────────────────────────────────────────────────────────────
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
  {
    id: 'post-portrait-tall',
    label: 'Sharepic 3:4',
    description: '1080 × 1440 · 3:4 · Instagram',
    group: 'sharepic-tall',
    category: 'digital',
    width: 1080,
    height: 1440,
    dpi: 72,
    iconKey: 'portrait',
    defaultExport: 'png',
    exportable: ['png', 'jpeg'],
  },
  // ── Profilbild ───────────────────────────────────────────────────────────
  {
    id: 'profile-square',
    label: 'Profilbild',
    description: '1080 × 1080 · 1:1',
    group: 'profilbild',
    category: 'digital',
    width: 1080,
    height: 1080,
    dpi: 72,
    iconKey: 'square',
    defaultExport: 'png',
    exportable: ['png', 'jpeg'],
  },
];

export const DEFAULT_FORMAT_ID = 'post-portrait';

/**
 * Templates whose fixed sheet is not 4:5. A document of such a template must
 * carry exactly this format: the stage takes the document's format and scales
 * the sheet to it per axis, so the square profile picture on a 4:5 document
 * came out stretched by 1.25 (#4087).
 */
const PINNED_TEMPLATE_FORMATS: Readonly<Record<string, string>> = {
  profilbild: 'profile-square',
};

export function pinnedFormatId(templateId: string): string | null {
  return PINNED_TEMPLATE_FORMATS[templateId] ?? null;
}

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

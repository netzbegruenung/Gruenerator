export type CanvasFormatCategory = 'digital' | 'print';

/**
 * UI-level grouping shown as section headers on the /studio page.
 * Distinct from `category` (digital/print) which drives backend PDF behavior.
 */
export type CanvasFormatGroup = 'sharepic' | 'story' | 'praesentation' | 'flyer' | 'plakat';

export type CanvasFormatIconKey =
  | 'square'
  | 'portrait'
  | 'story'
  | 'landscape'
  | 'flyer'
  | 'plakat';

export type CanvasExportType = 'png' | 'jpeg' | 'pdf';

export interface CanvasFormat {
  id: string;
  label: string;
  description: string;
  group: CanvasFormatGroup;
  category: CanvasFormatCategory;
  width: number;
  height: number;
  dpi: number;
  bleedPx?: number;
  paperMm?: { w: number; h: number };
  iconKey: CanvasFormatIconKey;
  defaultExport: CanvasExportType;
  exportable: ReadonlyArray<CanvasExportType>;
}

export const CANVAS_FORMAT_GROUP_LABEL: Record<CanvasFormatGroup, string> = {
  sharepic: 'Sharepics',
  story: 'Stories',
  praesentation: 'Präsentationen',
  flyer: 'Flyer',
  plakat: 'Plakate',
};

export const CANVAS_FORMAT_GROUP_ORDER: ReadonlyArray<CanvasFormatGroup> = [
  'sharepic',
  'story',
  'praesentation',
  'flyer',
  'plakat',
];

const A4_BLEED_PX = 36;
const A5_BLEED_PX = 36;
const A3_BLEED_PX = 36;

export const CANVAS_FORMATS: ReadonlyArray<CanvasFormat> = [
  // ── Sharepics ────────────────────────────────────────────────────────────
  // The existing sharepic design (1080×1350) is the canonical first format;
  // additional sharepic aspect-ratios are out of scope for v1.
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

  // ── Story ────────────────────────────────────────────────────────────────
  {
    id: 'story',
    label: 'Story',
    description: '1080 × 1920 · 9:16 · Instagram, TikTok, Reels',
    group: 'story',
    category: 'digital',
    width: 1080,
    height: 1920,
    dpi: 72,
    iconKey: 'story',
    defaultExport: 'png',
    exportable: ['png', 'jpeg'],
  },

  // ── Präsentationen ───────────────────────────────────────────────────────
  {
    id: 'presentation-16-9',
    label: 'Präsentation 16:9',
    description: '1920 × 1080 · Full HD',
    group: 'praesentation',
    category: 'digital',
    width: 1920,
    height: 1080,
    dpi: 72,
    iconKey: 'landscape',
    defaultExport: 'png',
    exportable: ['png', 'jpeg', 'pdf'],
  },
  {
    id: 'presentation-4-3',
    label: 'Präsentation 4:3',
    description: '1600 × 1200 · klassisches Slide-Format',
    group: 'praesentation',
    category: 'digital',
    width: 1600,
    height: 1200,
    dpi: 72,
    iconKey: 'landscape',
    defaultExport: 'png',
    exportable: ['png', 'jpeg', 'pdf'],
  },

  // ── Flyer ────────────────────────────────────────────────────────────────
  {
    id: 'flyer-a5',
    label: 'Flyer A5',
    description: '148 × 210 mm · 300 dpi · druckfertig',
    group: 'flyer',
    category: 'print',
    width: 1748,
    height: 2480,
    dpi: 300,
    bleedPx: A5_BLEED_PX,
    paperMm: { w: 148, h: 210 },
    iconKey: 'flyer',
    defaultExport: 'pdf',
    exportable: ['pdf', 'png'],
  },
  {
    id: 'flyer-a4',
    label: 'Flyer A4',
    description: '210 × 297 mm · 300 dpi · druckfertig',
    group: 'flyer',
    category: 'print',
    width: 2480,
    height: 3508,
    dpi: 300,
    bleedPx: A4_BLEED_PX,
    paperMm: { w: 210, h: 297 },
    iconKey: 'flyer',
    defaultExport: 'pdf',
    exportable: ['pdf', 'png'],
  },

  // ── Plakate ──────────────────────────────────────────────────────────────
  {
    id: 'plakat-a3',
    label: 'Plakat A3',
    description: '297 × 420 mm · 300 dpi · druckfertig',
    group: 'plakat',
    category: 'print',
    width: 3508,
    height: 4961,
    dpi: 300,
    bleedPx: A3_BLEED_PX,
    paperMm: { w: 297, h: 420 },
    iconKey: 'plakat',
    defaultExport: 'pdf',
    exportable: ['pdf', 'png'],
  },
  {
    id: 'plakat-a2',
    label: 'Plakat A2',
    description: '420 × 594 mm · 300 dpi · druckfertig',
    group: 'plakat',
    category: 'print',
    width: 4961,
    height: 7016,
    dpi: 300,
    bleedPx: A3_BLEED_PX,
    paperMm: { w: 420, h: 594 },
    iconKey: 'plakat',
    defaultExport: 'pdf',
    exportable: ['pdf', 'png'],
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

export function isPrintFormat(format: CanvasFormat): boolean {
  return format.category === 'print';
}

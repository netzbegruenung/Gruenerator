// SPDX-License-Identifier: MPL-2.0
import { messages } from '../i18n/messages.js';

export type CanvasFormatCategory = 'digital' | 'print';

/**
 * UI-level grouping shown as section headers on the /studio page. 3:4 is its
 * own group because only freeform lays out on it; the templates stay 4:5.
 * The square belongs to the profile picture alone. `print` is not one of the
 * studio groups (see canvasFormatGroupOrder).
 */
export type BuiltInCanvasFormatGroup =
  'sharepic' | 'sharepic-tall' | 'profilbild' | 'praesentation' | 'print';

/** A built-in group, or the id of a host group (see `registerCanvasFormatGroups`). */
export type CanvasFormatGroup = BuiltInCanvasFormatGroup | (string & {});

export type CanvasFormatIconKey = 'portrait' | 'square' | 'landscape';

export type CanvasExportType = 'png' | 'jpeg' | 'pdf' | 'pptx';

/** Print profile of a format. The canvas covers trim + bleed on every side. */
export interface CanvasPrintSpec {
  trimMm: { w: number; h: number };
  bleedMm: number;
  safeMm: number;
  exportDpi: number;
  seiten: number;
  /**
   * Where the V.i.S.d.P. / Impressum must stand: on every page (a poster set
   * of separate sheets), on the first or last page only, or nowhere (cards,
   * letterheads).
   */
  impressum: PrintImpressumSeite | null;
}

export type PrintImpressumSeite = 'jede-seite' | 'erste-seite' | 'letzte-seite';

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
  /** Null for digital formats. */
  print: CanvasPrintSpec | null;
}

export type PrintCanvasFormat = CanvasFormat & { category: 'print'; print: CanvasPrintSpec };

const BUILT_IN_GROUPS: ReadonlyArray<BuiltInCanvasFormatGroup> = [
  'sharepic',
  'sharepic-tall',
  'profilbild',
  'praesentation',
  'print',
];

/** The studio groups. Print stays out until the studio picker can create print canvases. */
const STUDIO_GROUPS: ReadonlyArray<BuiltInCanvasFormatGroup> = [
  'sharepic',
  'sharepic-tall',
  'profilbild',
  'praesentation',
];

const PRINT_BLEED_MM = 3;
const PRINT_EXPORT_DPI = 300;
/** Large formats print from a distance: 150 dpi, the usual large-format rate. */
const PRINT_LARGE_EXPORT_DPI = 150;
/** Working resolution: the long side including bleed is 2000 px. */
const PRINT_LONG_SIDE_PX = 2000;

function printFormat(
  id: string,
  name: string,
  trimMm: { w: number; h: number },
  safeMm: number,
  seiten: number,
  exportDpi = PRINT_EXPORT_DPI,
  impressum: PrintImpressumSeite | null = seiten === 1 ? 'jede-seite' : null
): PrintCanvasFormat {
  const pxPerMm = PRINT_LONG_SIDE_PX / (Math.max(trimMm.w, trimMm.h) + 2 * PRINT_BLEED_MM);
  return {
    id,
    label: `${name} · ${trimMm.w} × ${trimMm.h} mm`,
    description: `${trimMm.w} × ${trimMm.h} mm · ${PRINT_BLEED_MM} mm Beschnitt · ${seiten === 1 ? 'einseitig' : seiten === 2 ? 'Vorder- und Rückseite' : `${seiten} Seiten`}`,
    group: 'print',
    category: 'print',
    width: Math.round((trimMm.w + 2 * PRINT_BLEED_MM) * pxPerMm),
    height: Math.round((trimMm.h + 2 * PRINT_BLEED_MM) * pxPerMm),
    dpi: exportDpi,
    iconKey: trimMm.w > trimMm.h ? 'landscape' : 'portrait',
    defaultExport: 'pdf',
    exportable: ['pdf', 'png'],
    print: { trimMm, bleedMm: PRINT_BLEED_MM, safeMm, exportDpi, seiten, impressum },
  };
}

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
    print: null,
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
    print: null,
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
    print: null,
  },
  // ── Präsentation ─────────────────────────────────────────────────────────
  {
    id: 'slide-16-9',
    label: 'Präsentation',
    description: '1920 × 1080 · 16:9 · Folien',
    group: 'praesentation',
    category: 'digital',
    width: 1920,
    height: 1080,
    dpi: 72,
    iconKey: 'landscape',
    defaultExport: 'pptx',
    exportable: ['pptx', 'pdf', 'png'],
    print: null,
  },
  // ── Print ────────────────────────────────────────────────────────────────
  printFormat('print-visitenkarte-quer', 'Visitenkarte quer', { w: 85, h: 55 }, 3, 2),
  printFormat('print-visitenkarte-hoch', 'Visitenkarte hoch', { w: 55, h: 85 }, 3, 2),
  printFormat('print-a3-hoch', 'Plakat A3 hoch', { w: 297, h: 420 }, 4, 1),
  printFormat('print-a4-hoch', 'Plakat A4 hoch', { w: 210, h: 297 }, 4, 1),
  printFormat('print-a3-quer', 'Plakat A3 quer', { w: 420, h: 297 }, 4, 1),
  printFormat('print-a1-hoch', 'Plakat A1 hoch', { w: 594, h: 841 }, 10, 1, PRINT_LARGE_EXPORT_DPI),
  printFormat('print-a1-quer', 'Plakat A1 quer', { w: 841, h: 594 }, 10, 1, PRINT_LARGE_EXPORT_DPI),
  // 18/1 billboard: the artwork is supplied at A2 and enlarged (print spec).
  printFormat(
    'print-grossflaeche',
    'Großfläche 18/1 (Vorlage A2)',
    { w: 594, h: 420 },
    10,
    1,
    PRINT_LARGE_EXPORT_DPI
  ),
  // Visible area 230 × 342 mm (print spec): the safe zone ends inside it.
  printFormat('print-citylight', 'Citylight', { w: 237, h: 350 }, 8, 1, PRINT_LARGE_EXPORT_DPI),
  // Roll fold to DIN lang: panels 100 / 100 / 97 mm, outside and inside (print spec).
  printFormat(
    'print-flyer-dinlang',
    'Flyer DIN lang (A4 quer, Wickelfalz)',
    { w: 297, h: 210 },
    4,
    2,
    PRINT_EXPORT_DPI,
    'erste-seite'
  ),
  printFormat(
    'print-a6-hoch',
    'Flyer A6 hoch',
    { w: 105, h: 148 },
    3,
    2,
    PRINT_EXPORT_DPI,
    'letzte-seite'
  ),
  printFormat(
    'print-a6-quer',
    'Flyer A6 quer',
    { w: 148, h: 105 },
    3,
    2,
    PRINT_EXPORT_DPI,
    'letzte-seite'
  ),
  printFormat('print-briefbogen-a4', 'Briefbogen A4', { w: 210, h: 297 }, 5, 2),
  printFormat(
    'print-zeitung-a4',
    'Zeitung A4',
    { w: 210, h: 297 },
    5,
    4,
    PRINT_EXPORT_DPI,
    'letzte-seite'
  ),
];

export const DEFAULT_FORMAT_ID = 'post-portrait';

/**
 * Formats a host adds to the built-ins. A module-level register, like the
 * brand packs, because lookups run in commands and offscreen roots without
 * React context. `CANVAS_FORMATS` stays the built-ins only; everything that
 * must also see host formats reads `canvasFormats()`.
 */
let hostFormats: ReadonlyArray<CanvasFormat> = [];

/** Replaces the host's formats (an empty list clears them). Ids must be unique and not built-in; groups must be built-in or registered. */
export function registerCanvasFormats(formats: ReadonlyArray<CanvasFormat>): void {
  const seen = new Set(CANVAS_FORMATS.map((f) => f.id));
  for (const f of formats) {
    if (seen.has(f.id)) throw new Error(`Canvas format id '${f.id}' is already taken`);
    if (!isKnownGroup(f.group)) {
      throw new Error(`Canvas format '${f.id}' uses unknown group '${f.group}'`);
    }
    seen.add(f.id);
  }
  hostFormats = [...formats];
}

export interface CanvasFormatGroupDef {
  id: string;
  label: string;
}

/** Host groups: module-level like the formats, read in non-React code. */
let hostGroups: ReadonlyArray<CanvasFormatGroupDef> = [];

function isKnownGroup(id: string): boolean {
  return (
    (BUILT_IN_GROUPS as ReadonlyArray<string>).includes(id) || hostGroups.some((g) => g.id === id)
  );
}

/** Replaces the host's format groups (an empty list clears them). Ids must be unique and not built-in. */
export function registerCanvasFormatGroups(groups: ReadonlyArray<CanvasFormatGroupDef>): void {
  const seen = new Set<string>(BUILT_IN_GROUPS);
  for (const g of groups) {
    if (seen.has(g.id)) throw new Error(`Canvas format group id '${g.id}' is already taken`);
    seen.add(g.id);
  }
  hostGroups = [...groups];
}

/** The studio groups, host groups after the built-ins. Read lazily. */
export function canvasFormatGroupOrder(): ReadonlyArray<CanvasFormatGroup> {
  return [...STUDIO_GROUPS, ...hostGroups.map((g) => g.id)];
}

/** Display label of a group: the active catalogue for built-ins, the host's label otherwise. */
export function canvasFormatGroupLabel(id: CanvasFormatGroup): string {
  const host = hostGroups.find((g) => g.id === id);
  if (host) return host.label;
  const labels: Readonly<Record<string, string>> = messages().formats.groups;
  return labels[id] ?? id;
}

/** The built-in formats followed by the registered ones. */
export function canvasFormats(): ReadonlyArray<CanvasFormat> {
  return hostFormats.length === 0 ? CANVAS_FORMATS : [...CANVAS_FORMATS, ...hostFormats];
}

/**
 * Templates whose fixed sheet is not 4:5. A document of such a template must
 * carry exactly this format: the stage takes the document's format and scales
 * the sheet to it per axis, so the square profile picture on a 4:5 document
 * came out stretched by 1.25 (#4087).
 */
const PINNED_TEMPLATE_FORMATS: Readonly<Record<string, string>> = {
  profilbild: 'profile-square',
  sticker: 'profile-square',
};

export function pinnedFormatId(templateId: string): string | null {
  return PINNED_TEMPLATE_FORMATS[templateId] ?? null;
}

/**
 * The digital format of exactly this size, for a template that comes without
 * one: the stage scales the template's space onto its format per axis, so the
 * default 4:5 format would stretch any other size.
 */
export function formatIdForSize(width: number, height: number): string | null {
  return (
    canvasFormats().find((f) => !isPrintFormat(f) && f.width === width && f.height === height)
      ?.id ?? null
  );
}

export function getCanvasFormat(id: string): CanvasFormat | null {
  return canvasFormats().find((f) => f.id === id) ?? null;
}

/** Die eine Stelle, die beantwortet: ist das eine Präsentation? */
export function isSlideFormat(format: CanvasFormat): boolean {
  return format.group === 'praesentation';
}

/**
 * Startgröße neu eingefügter Elemente (Text, Formen, Icons, Grafiken,
 * Diagramme): die Voreinstellungen sind für 1080 px breite Sharepics gemacht,
 * auf einer Folie wachsen sie mit der Breite. Alle anderen Formate: 1.
 */
export function insertScaleFor(format: CanvasFormat): number {
  return isSlideFormat(format) ? format.width / 1080 : 1;
}

export function isPrintFormat(format: CanvasFormat): format is PrintCanvasFormat {
  return format.category === 'print' && format.print !== null;
}

/**
 * A print id this build does not know (a newer app saved it). It must not
 * render as 4:5: the editor refuses it instead of autosaving a wrong sheet.
 */
export function isUnsupportedFormatId(id: string | null | undefined): boolean {
  return !!id && id.startsWith('print-') && !getCanvasFormat(id);
}

export class UnsupportedCanvasFormatError extends Error {
  constructor(readonly formatId: string) {
    super(`Unsupported canvas format '${formatId}'`);
    this.name = 'UnsupportedCanvasFormatError';
  }
}

/** Unknown digital ids fall back to the default; unknown print ids throw. */
export function getCanvasFormatOrDefault(id: string | null | undefined): CanvasFormat {
  if (id) {
    const found = getCanvasFormat(id);
    if (found) return found;
    if (isUnsupportedFormatId(id)) throw new UnsupportedCanvasFormatError(id);
  }
  const fallback = getCanvasFormat(DEFAULT_FORMAT_ID);
  if (!fallback) {
    throw new Error(`CANVAS_FORMATS missing default '${DEFAULT_FORMAT_ID}'`);
  }
  return fallback;
}

export function mmToPx(format: PrintCanvasFormat, mm: number): number {
  const { trimMm, bleedMm } = format.print;
  return (
    (mm * Math.max(format.width, format.height)) / (Math.max(trimMm.w, trimMm.h) + 2 * bleedMm)
  );
}

export interface PrintRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Trim, bleed and safe area in canvas px; the origin is the outer bleed edge. */
export function printGeometry(format: PrintCanvasFormat): {
  trim: PrintRect;
  bleed: PrintRect;
  safe: PrintRect;
} {
  const { trimMm, bleedMm, safeMm } = format.print;
  const inset = (mm: number): PrintRect => ({
    x: mmToPx(format, mm),
    y: mmToPx(format, mm),
    width: mmToPx(format, trimMm.w + 2 * (bleedMm - mm)),
    height: mmToPx(format, trimMm.h + 2 * (bleedMm - mm)),
  });
  return {
    bleed: { x: 0, y: 0, width: format.width, height: format.height },
    trim: inset(bleedMm),
    safe: inset(bleedMm + safeMm),
  };
}

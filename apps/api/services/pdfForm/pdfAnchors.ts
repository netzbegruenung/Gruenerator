/**
 * Anchor detection for FLAT PDF forms — the ones with no usable AcroForm.
 *
 * Why this exists: of eight real German authority forms measured (Detmold
 * Zweitwohnungssteuer, Kindergeld KG1 + Anlagen, KG54 Arbeitgeber-
 * bescheinigungen), NOT ONE is fillable through its AcroForm. Either there are
 * no widgets at all, or they are degenerate (`/Rect [0 0 0 0]`). Filling those
 * forms means finding the labels in the text layer and writing next to them.
 *
 * The output deliberately mirrors `PdfFormField`, so the chat tools' read→fill
 * flow works unchanged whether the fields came from an AcroForm or from here.
 *
 * IMPORTANT: these boxes are DERIVED, not read. The page borders are not
 * recoverable (they are images or form XObjects, not path geometry), so the
 * writable area is inferred from label geometry. Nothing here may write without
 * a human confirming the placement first.
 */
import { createLogger } from '../../utils/logger.js';

const log = createLogger('pdfAnchors');

export interface AnchorBox {
  /** 1-based page number. */
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnchorField {
  /** The label text — doubles as the field name the model addresses. */
  name: string;
  kind: 'text' | 'checkbox';
  box: AnchorBox;
}

interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Vertical tolerance for grouping items into one row (pt). */
const ROW_TOLERANCE = 2;
/** Gap kept between a label and the value drawn beneath it (pt). */
const LABEL_GAP = 3;
/** Column separation: values stop this far before the next column's label. */
const COLUMN_GAP = 6;
/** Fallback row height when a row has no successor (last row on a page). */
const DEFAULT_ROW_HEIGHT = 20;
/** Checkbox squares in these forms are ~10pt images. */
const CHECKBOX_MIN = 4;
const CHECKBOX_MAX = 16;
/** Max horizontal distance between a checkbox and the label naming it. */
const CHECKBOX_LABEL_REACH = 40;

/**
 * Prose, headings and boilerplate that look like a label but never are.
 * Complements the size filter below — measured against the Detmold form, where
 * the small-text class still contains the footer's "Erstellt mit MACH
 * formsolutions" and similar.
 */
function isLabelLike(s: string): boolean {
  if (s.length < 2 || s.length > 45) return false;
  if (/[.!?:]$/.test(s)) return false;
  if (s.split(/\s+/).length > 7) return false;
  if (!/[A-Za-zÄÖÜäöüß]/.test(s)) return false;
  // Page furniture.
  if (/^(seite\s+\d|erstellt mit|artikel-nr|stand:)/i.test(s)) return false;
  return true;
}

/**
 * Which text sizes carry field labels. Measured on the Detmold form: of 53 known
 * AcroForm field names, 31 appear at 7pt and 3 more at 8pt, while sizes ≥9pt
 * (headings, address block, explanatory prose, the title) contain ZERO. Taking
 * the two smallest populated size classes is therefore a strong, cheap filter —
 * far better than trying to tell a heading from a label by wording.
 */
function labelSizes(items: TextItem[]): Set<number> {
  const counts = new Map<number, number>();
  for (const it of items) {
    const h = Math.round(it.height);
    if (h <= 0) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  // On a densely populated page, a size used once or twice is a stray glyph and
  // would drag the "smallest" class down to noise. On a sparse page (a short
  // form, a test fixture) that same rule would discard every real label — so it
  // only applies once there is enough text to judge by.
  const total = items.length;
  const minOccurrences = total >= 20 ? 3 : 1;
  const populated = [...counts.entries()]
    .filter(([, n]) => n >= minOccurrences)
    .map(([h]) => h)
    .sort((a, b) => a - b);
  return new Set(populated.slice(0, 2));
}

/** Group items into visual rows by their baseline. */
function groupRows(items: TextItem[]): TextItem[][] {
  const rows = new Map<number, TextItem[]>();
  for (const it of items) {
    const key = Math.round(it.y / ROW_TOLERANCE) * ROW_TOLERANCE;
    rows.set(key, [...(rows.get(key) ?? []), it]);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0]) // top of page first
    .map(([, row]) => row.sort((a, b) => a.x - b.x));
}

interface PageGeometry {
  width: number;
  height: number;
  items: TextItem[];
  /** Small square image placements — the checkbox squares in these forms. */
  squares: Array<{ x: number; y: number; size: number }>;
}

/**
 * Read one page's text items WITH their positions, plus the placements of small
 * square images. `pdfOperations` consumes the transform matrix only to decide
 * spacing while joining items; anchor detection is all about that matrix.
 */
async function readPage(
  pdfjs: PdfjsModule,
  doc: PdfjsDocument,
  pageNo: number
): Promise<PageGeometry> {
  const page = await doc.getPage(pageNo);
  const viewport = page.getViewport({ scale: 1 });

  const content = await page.getTextContent();
  const items: TextItem[] = content.items
    .map((raw) => {
      const i = raw as { str?: string; width?: number; height?: number; transform?: number[] };
      const t = i.transform ?? [1, 0, 0, 1, 0, 0];
      return {
        str: (i.str ?? '').trim(),
        x: t[4],
        y: t[5],
        width: i.width ?? 0,
        height: i.height ?? 0,
      };
    })
    .filter((i) => i.str.length > 0);

  // Checkbox squares are image XObjects, not path geometry — track the CTM
  // through save/restore/transform to recover where each one landed.
  const squares: PageGeometry['squares'] = [];
  try {
    const ops = await page.getOperatorList();
    const names: Record<number, string> = {};
    for (const key of Object.keys(pdfjs.OPS)) names[pdfjs.OPS[key]] = key;

    const stack: number[][] = [];
    let ctm = [1, 0, 0, 1, 0, 0];
    const mul = (a: number[], b: number[]): number[] => [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];

    for (let i = 0; i < ops.fnArray.length; i++) {
      const op = names[ops.fnArray[i]];
      if (op === 'save') stack.push(ctm.slice());
      else if (op === 'restore') ctm = stack.pop() ?? ctm;
      else if (op === 'transform') ctm = mul(ctm, ops.argsArray[i] as number[]);
      else if (op === 'paintImageXObject') {
        const w = Math.abs(ctm[0]);
        const h = Math.abs(ctm[3]);
        if (w >= CHECKBOX_MIN && w <= CHECKBOX_MAX && Math.abs(w - h) < 2) {
          squares.push({ x: ctm[4], y: ctm[5], size: w });
        }
      }
    }
  } catch (error) {
    // Operator lists are optional intelligence — text anchors still work.
    log.warn(`[pdfAnchors] Operator list unavailable on page ${pageNo}: ${String(error)}`);
  }

  return { width: viewport.width, height: viewport.height, items, squares };
}

/**
 * Pick the writable area for a label by looking for FREE SPACE around it,
 * instead of assuming a direction.
 *
 * Measured across 215 ground-truth widgets from six real authority forms, the
 * label sits above the field in only 33 % of cases; 29 % have it to the right,
 * 17 % to the left, 7 % below. A single directional rule is therefore capped at
 * roughly a third by construction — which is exactly where the first version
 * landed (37 % recall). So each direction is tried, boxes that collide with
 * other text are discarded, and the roomiest survivor wins.
 */
function bestFreeSpace(
  label: TextItem,
  geo: PageGeometry,
  others: TextItem[],
  /** The next label to the right on the SAME row, if any — it bounds the cell
   *  underneath, which would otherwise run across the neighbouring column. */
  nextInRow: TextItem | null
): { x: number; y: number; width: number; height: number } | null {
  const marginLeft = 45;
  const marginRight = geo.width - 45;
  const rowH = DEFAULT_ROW_HEIGHT;
  const labelRight = label.x + label.width;

  const belowRight = nextInRow ? nextInRow.x - COLUMN_GAP : marginRight;
  const candidateBoxes = [
    // below, bounded by the next column
    { x: label.x, y: label.y - LABEL_GAP - rowH, width: belowRight - label.x, height: rowH },
    // right of the label
    {
      x: labelRight + COLUMN_GAP,
      y: label.y - 3,
      width: marginRight - (labelRight + COLUMN_GAP),
      height: rowH * 0.8,
    },
    // left of the label
    {
      x: marginLeft,
      y: label.y - 3,
      width: label.x - COLUMN_GAP - marginLeft,
      height: rowH * 0.8,
    },
  ];

  const collides = (b: { x: number; y: number; width: number; height: number }): boolean =>
    others.some((o) => {
      if (o === label) return false;
      const oTop = o.y + o.height;
      return (
        o.x < b.x + b.width &&
        o.x + Math.max(o.width, 4) > b.x &&
        o.y < b.y + b.height &&
        oTop > b.y
      );
    });

  // Largest viable box wins. A strict preference order (below → right → left)
  // was measured too and came out clearly worse (27 % recall vs 37 %), so the
  // roomiest free space is the better signal even though it sometimes prefers a
  // margin to the correct cell.
  let best: { x: number; y: number; width: number; height: number } | null = null;
  for (const raw of candidateBoxes) {
    if (raw.width < 25 || raw.height < 6) continue;
    // Shrink from the far edge until the box no longer hits neighbouring text —
    // a value box may be narrow, it may not sit on top of another label.
    let box = raw;
    let guard = 0;
    while (collides(box) && box.width > 25 && guard++ < 40) {
      box = { ...box, width: box.width - 12 };
    }
    if (collides(box) || box.width < 25) continue;
    if (!best || box.width * box.height > best.width * best.height) best = box;
  }
  return best;
}

/**
 * Derive fillable anchors from a flat form.
 *
 * The layout rule is the German "Formularkasten": a small label sits at the top
 * left of a bordered cell and the value goes UNDERNEATH it — not to its right.
 * Getting this backwards puts every value in the wrong place, so it is asserted
 * by the tests rather than assumed.
 */
export async function detectAnchorFields(bytes: Buffer): Promise<AnchorField[]> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as unknown as PdfjsModule;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
    .promise;

  const fields: AnchorField[] = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    const geo = await readPage(pdfjs, doc, pageNo);
    const sizes = labelSizes(geo.items);
    const candidates = geo.items.filter(
      (i) => sizes.has(Math.round(i.height)) && isLabelLike(i.str)
    );
    if (candidates.length === 0) continue;

    const rows = groupRows(candidates);
    const claimed = new Set<number>();

    // Checkboxes first: a square with a label just to its right is a tick box,
    // and that label must NOT also become a text field.
    for (const sq of geo.squares) {
      let best: { item: TextItem; dist: number } | null = null;
      for (const it of candidates) {
        const sameLine = Math.abs(it.y - sq.y) <= sq.size;
        const toTheRight = it.x >= sq.x;
        const dist = it.x - (sq.x + sq.size);
        if (sameLine && toTheRight && dist >= 0 && dist < CHECKBOX_LABEL_REACH) {
          if (!best || dist < best.dist) best = { item: it, dist };
        }
      }
      if (!best) continue;
      claimed.add(candidates.indexOf(best.item));
      fields.push({
        name: best.item.str,
        kind: 'checkbox',
        box: { page: pageNo, x: sq.x, y: sq.y, width: sq.size, height: sq.size },
      });
    }

    for (const row of rows) {
      for (const [colIndex, item] of row.entries()) {
        if (claimed.has(candidates.indexOf(item))) continue;
        const box = bestFreeSpace(item, geo, candidates, row[colIndex + 1] ?? null);
        if (box) fields.push({ name: item.str, kind: 'text', box: { page: pageNo, ...box } });
      }
    }
  }

  log.info(`[pdfAnchors] ${fields.length} Anker über ${doc.numPages} Seite(n)`);
  return fields;
}

// ── Minimal structural types for the untyped pdfjs legacy build ──────────────

interface PdfjsModule {
  OPS: Record<string, number>;
  getDocument(src: { data: Uint8Array; useSystemFonts?: boolean }): {
    promise: Promise<PdfjsDocument>;
  };
}
interface PdfjsDocument {
  numPages: number;
  getPage(n: number): Promise<PdfjsPage>;
}
interface PdfjsPage {
  getViewport(o: { scale: number }): { width: number; height: number };
  getTextContent(): Promise<{ items: unknown[] }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
}

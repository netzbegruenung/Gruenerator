/**
 * The DE photo posters of the 2024 styleguide: candidate (p. 38/39), topic
 * (p. 40/41), billboard (p. 42/43), citylight (p. 46/47) and the event poster
 * in both versions (p. 23–28). Built in today's practice: the Textbalken are
 * gone, the type stands on a flat Tanne field cut hard into the photo, or on
 * the ground colour. No fades: every edge is hard.
 *
 * Every layout shares one grammar: a motif area (the photo, the whole page or
 * touching one or two edges of a Tanne/Klee ground), the text block low on the
 * left, a Störer in Himmel with Sand type, the sunflower in Sonne cut by an
 * edge, the domain as the sender, centred at the foot (billboard: bottom right),
 * and the V.i.S.d.P. turned in the left margin.
 *
 * The photo is the page's background image, cover-fitted and centred on the
 * motif area; ground panels cover the rest. So it stays replaceable through
 * the background like any sharepic photo, and the print export checks its dpi.
 */
import {
  printFotoSrc,
  type PrintImpressum,
  type PrintKandidatSlots,
  type PrintMitwirkende,
  type PrintSpec,
} from '@gruenerator/contracts';

import { type TextAccent } from '../utils/textUtils';

import { LIME, SHAREPIC_COLOR_HEX } from './chromeParts';
import { type ComposedSlide } from './composeSharepic';
import {
  BODY_LEADING,
  blockHeight,
  blume,
  fitStack,
  fitWords,
  FULL,
  HEAD_LEADING,
  impressumElement,
  impressumText,
  KLEE,
  motif,
  page,
  placeStack,
  feld,
  stackHeight,
  stoerer,
  WHITE,
  withAccent,
  type Area,
  type Block,
  type Frame,
  type Page,
  type PhotoSrc,
} from './printFrame';

type PlakatSpec = Extract<PrintSpec, { variante: 'kandidat' | 'thema' | 'veranstaltung' }>;

const TANNE = SHAREPIC_COLOR_HEX.tanne;
const MINT = SHAREPIC_COLOR_HEX.mint;
const DE_ACCENT: TextAccent = { fill: LIME };

/**
 * The domain as the sender (CD p. 7–9): GrueneType, as large as A1's 162 pt
 * (billboard: 91 pt on its A2 artwork), smaller only where a long domain needs it.
 */
function absender(f: Frame, web: string, share: number, width: number): Block {
  const family = f.theme.fonts.headline;
  const base = share * f.shortSide;
  const one = f.measure(web, base, family, 'normal');
  return {
    before: 0,
    props: {
      id: 'pr-web',
      text: web,
      type: 'subheader',
      fontSize: one > width ? (base * width) / one : base,
      fontFamily: family,
      fontStyle: 'normal',
      fill: WHITE,
      lineHeight: 1,
      align: 'center',
    },
  };
}

const headline = (f: Frame, id: string, text: string, size: number, before: number): Block => ({
  before,
  props: {
    id,
    text,
    type: 'header',
    fontSize: size,
    fontFamily: f.theme.fonts.headline,
    fontStyle: 'normal',
    fill: WHITE,
    lineHeight: HEAD_LEADING['de-DE'],
    accent: DE_ACCENT,
  },
});

const zeile = (
  f: Frame,
  id: string,
  text: string,
  size: number,
  before: number,
  fill: string
): Block => ({
  before,
  props: {
    id,
    text,
    type: 'subheader',
    fontSize: size,
    fontFamily: f.theme.fonts.headline,
    fontStyle: 'normal',
    fill,
    lineHeight: HEAD_LEADING['de-DE'],
  },
});

const fliess = (
  f: Frame,
  id: string,
  text: string,
  size: number,
  before: number,
  bold = false
): Block => ({
  before,
  props: {
    id,
    text,
    type: 'body',
    fontSize: size,
    fontFamily: f.theme.fonts.body,
    fontStyle: bold ? 'bold' : 'normal',
    fill: WHITE,
    lineHeight: BODY_LEADING,
  },
});

/** The headline group: Dachzeile (mint, 43 %), headline (100 %, lime accent), subline (43 %). */
function aussage(
  f: Frame,
  slots: { dachzeile?: string; headline: string; akzent?: string; subline?: string },
  size: number
): Block[] {
  const blocks: Block[] = [];
  const klein = 0.43 * size;
  if (slots.dachzeile) blocks.push(zeile(f, 'pr-dachzeile', slots.dachzeile, klein, 0, MINT));
  blocks.push(
    headline(f, 'pr-headline', withAccent(slots.headline, slots.akzent), size, 0.2 * size)
  );
  if (slots.subline) blocks.push(zeile(f, 'pr-subline', slots.subline, klein, 0.25 * size, WHITE));
  return blocks;
}

function kandidatBlocks(f: Frame, slots: PrintKandidatSlots, size: number): Block[] {
  const blocks = [headline(f, 'pr-name', slots.name, size, 0)];
  if (slots.subline) {
    blocks.push(zeile(f, 'pr-subline', slots.subline, 0.43 * size, 0.2 * size, WHITE));
  }
  return blocks;
}

/** Where a candidate's or topic's parts go, per ground and orientation. */
interface FotoLayout {
  area: Area;
  ground: string;
  /** The sunflower: centre as trim shares, size as a share of the short side. */
  blume: { cx: number; cy: number; size: number };
}

function fotoLayout(spec: PlakatSpec, quer: boolean): FotoLayout {
  const kandidat = spec.variante === 'kandidat';
  if (spec.stil === 'tanne') {
    return quer
      ? {
          area: { x0: 0, x1: 0.58, y0: 0, y1: 1 },
          ground: TANNE,
          blume: { cx: 0.9, cy: 1, size: 0.42 },
        }
      : {
          area: { x0: 0, x1: 0.84, y0: 0, y1: 0.74 },
          ground: TANNE,
          blume: { cx: 0.97, cy: 0.05, size: 0.42 },
        };
  }
  if (spec.stil === 'klee') {
    return quer
      ? {
          area: { x0: 0, x1: 0.56, y0: 0.14, y1: 1 },
          ground: KLEE,
          blume: { cx: 0.9, cy: 1, size: 0.42 },
        }
      : {
          area: { x0: 0.1, x1: 1, y0: 0.07, y1: 0.8 },
          ground: KLEE,
          blume: { cx: 0.06, cy: 0.07, size: 0.38 },
        };
  }
  // The whole page: the flower beside the head (candidate) or at the right edge (topic).
  return {
    area: FULL,
    ground: TANNE,
    blume: quer
      ? { cx: 1, cy: 0.42, size: 0.5 }
      : kandidat
        ? { cx: 0.02, cy: 0.33, size: 0.4 }
        : { cx: 1, cy: 0.6, size: 0.4 },
  };
}

/** Candidate, topic, billboard and citylight: one photo, one statement. */
function fotoPlakat(
  f: Frame,
  spec: Extract<PlakatSpec, { variante: 'kandidat' | 'thema' }>,
  src: PhotoSrc
): ComposedSlide {
  const { inner, trim, u } = f;
  const quer = trim.width > trim.height;
  const billboard = spec.format === 'print-grossflaeche';
  const layout = fotoLayout(spec, quer);
  const p = page(layout.ground);
  const fotoRect = motif(p, f, spec.slots.foto, layout.area, layout.ground, src);
  const full = layout.area === FULL;
  const gap = 1.2 * u;
  const bottom = inner.y + inner.height;

  // The text column: below the billboard's horizontal join, left of its
  // vertical one on a full photo, on the ground beside a framed one.
  const midX = trim.x + trim.width / 2;
  const midY = trim.y + trim.height / 2;
  const column = quer
    ? full
      ? { x: inner.x, width: midX - gap - inner.x }
      : {
          x: fotoRect.x + fotoRect.width + gap,
          width: inner.x + inner.width - (fotoRect.x + fotoRect.width + gap),
        }
    : { x: inner.x, width: inner.width * 0.86 };

  // The sender: centred at the foot; the billboard's on the field at the bottom
  // right, right of the join (p. 43 has it top right, on a photo it would need a fade).
  const web = spec.slots.web
    ? absender(
        f,
        spec.slots.web,
        billboard ? 0.0765 : 0.0962,
        billboard ? inner.x + inner.width - midX - gap : inner.width
      )
    : null;
  const webHeight = web ? blockHeight(f, web, inner.width) : 0;
  // A framed landscape keeps the text above the flower cut by the foot.
  const blumeTop = trim.y + layout.blume.cy * trim.height - (layout.blume.size * f.shortSide) / 2;
  const textBottom =
    web && !billboard
      ? bottom - webHeight - gap
      : quer && !full
        ? Math.min(bottom, blumeTop - gap)
        : bottom;

  const top = quer
    ? billboard
      ? midY + gap
      : inner.y + inner.height * 0.35
    : inner.y + inner.height * 0.45;
  const start = (quer ? 0.12 : 0.13) * f.shortSide;
  const blocks = fitStack(
    f,
    (size) =>
      spec.variante === 'kandidat'
        ? kandidatBlocks(f, spec.slots, size)
        : aussage(f, spec.slots, size),
    start,
    column.width,
    textBottom - top
  );
  const textTop = textBottom - stackHeight(f, blocks, column.width);

  // The type never stands on the photo itself: from just above it down, a flat
  // field in Tanne (the ground colour on a framed photo) cuts the photo off.
  if (full || !quer) feld(p, fotoRect, textTop - gap, full ? TANNE : layout.ground);

  blume(p, f, layout.blume.cx, layout.blume.cy, layout.blume.size * f.shortSide);
  placeStack(p, f, blocks, column.x, textTop, column.width);
  if (web && billboard) {
    const w = inner.x + inner.width - midX - gap;
    p.text({ ...web.props, align: 'right', x: midX + gap, y: bottom - webHeight, width: w });
  } else if (web) {
    p.text({ ...web.props, x: inner.x, y: bottom - webHeight, width: inner.width });
  }

  // Beside the person, not on the face: the left of the column (CD p. 38/39).
  if (spec.slots.stoerer) {
    const r = 0.11 * f.shortSide;
    const x = quer && !full ? column.x + column.width - r : column.x + r;
    const y = billboard ? Math.min(textTop - gap - r, midY - gap - r) : textTop - gap * 0.5 - r;
    stoerer(p, f, 'pr-stoerer', spec.slots.stoerer, x, Math.max(inner.y + r, y), r);
  }

  addImpressum(p, f, spec.impressum);
  return p.out;
}

function addImpressum(p: Page, f: Frame, impressum: PrintImpressum | null) {
  if (impressum) p.text(impressumElement(f, impressumText(impressum)));
}

// ── Event poster ──────────────────────────────────────────────────────────────

/** One speaker: the line above a group (bold), the name (GrueneType), the function. */
function personBlocks(
  f: Frame,
  m: PrintMitwirkende,
  i: number,
  size: number,
  first: boolean
): Block[] {
  const klein = Math.max(0.36 * size, f.pt(9));
  const blocks: Block[] = [];
  if (m.rolle)
    blocks.push(fliess(f, `pr-rolle-${i}`, m.rolle, klein, first ? 0 : 0.7 * size, true));
  blocks.push(
    zeile(
      f,
      `pr-person-${i}`,
      m.name,
      size,
      blocks.length ? 0.15 * size : first ? 0 : 0.55 * size,
      WHITE
    )
  );
  if (m.funktion) blocks.push(fliess(f, `pr-funktion-${i}`, m.funktion, klein, 0.05 * size));
  return blocks;
}

function ortBlock(f: Frame, ort: string, size: number, before: number): Block {
  return zeile(f, 'pr-ort', ort, size, before, MINT);
}

/**
 * V1 (p. 23–25): the photo across the top (upright) or the left half
 * (landscape) with the headline group on it, the speakers, the place and the
 * sender on Tanne, the date in the Störer on the photo's edge.
 */
function veranstaltungFoto(
  f: Frame,
  spec: Extract<PlakatSpec, { variante: 'veranstaltung' }>,
  foto: string,
  src: PhotoSrc
): ComposedSlide {
  const { inner, trim, u } = f;
  const s = spec.slots;
  const quer = trim.width > trim.height;
  const gap = 1.2 * u;
  const p = page(TANNE);
  const area: Area = quer ? { x0: 0, x1: 0.5, y0: 0, y1: 1 } : { x0: 0, x1: 1, y0: 0, y1: 0.42 };
  const fotoRect = motif(p, f, foto, area, TANNE, src);
  const r = 0.1 * f.shortSide;

  // The headline group sits low, on a Tanne field cut hard into the photo.
  // Upright, the group ends left of the date Störer on the photo's edge.
  const groupWidth = quer
    ? fotoRect.width - (inner.x - trim.x) - gap
    : inner.width - (s.datum ? 2 * r + gap : 0);
  const groupBottom = quer ? inner.y + inner.height : fotoRect.y + fotoRect.height - gap;
  const groupRoom = (quer ? inner.height : fotoRect.height - (inner.y - fotoRect.y)) * 0.62;
  const group = fitStack(
    f,
    (size) => aussage(f, s, size),
    0.1 * f.shortSide,
    groupWidth,
    groupRoom
  );
  const groupTop = groupBottom - stackHeight(f, group, groupWidth);
  feld(p, fotoRect, groupTop - gap, TANNE);

  // The panel: speakers, place, sender.
  const panel = quer
    ? {
        x: fotoRect.x + fotoRect.width + gap * 1.5,
        y: inner.y,
        width: inner.x + inner.width - (fotoRect.x + fotoRect.width + gap * 1.5),
        bottom: inner.y + inner.height,
      }
    : {
        x: inner.x,
        y: fotoRect.y + fotoRect.height + gap * 1.5,
        width: inner.width,
        bottom: inner.y + inner.height,
      };
  const blumeSize = (quer ? 0.32 : 0.45) * f.shortSide;
  // Upright: cut by the right edge beside the list; landscape: the top-right corner.
  if (quer) blume(p, f, 0.97, 0.04, blumeSize);
  else blume(p, f, 1.02, 0.68, blumeSize);
  const blumeTop = quer ? trim.y + 0.04 * trim.height + blumeSize / 2 + gap : panel.y;
  const listX = panel.x;
  const listWidth = quer ? panel.width : panel.width * 0.66;
  const listTop = quer ? Math.max(panel.y, blumeTop) : panel.y;

  const web = s.web ? absender(f, s.web, quer ? 0.075 : 0.0962, panel.width) : null;
  const webH = web ? blockHeight(f, web, panel.width) : 0;
  if (web) p.text({ ...web.props, x: panel.x, y: panel.bottom - webH, width: panel.width });
  const listBottom = panel.bottom - (web ? webH + gap : 0);

  const list = fitStack(
    f,
    (size) => [
      ...(s.mitwirkende ?? []).flatMap((m, i) => personBlocks(f, m, i, size, i === 0)),
      ...(s.ort ? [ortBlock(f, s.ort, 0.75 * size, s.mitwirkende?.length ? 0.9 * size : 0)] : []),
    ],
    0.065 * f.shortSide,
    listWidth,
    listBottom - listTop
  );
  placeStack(p, f, list, listX, listTop, listWidth);
  placeStack(p, f, group, inner.x, groupTop, groupWidth);

  // Upright on the photo's lower edge; landscape on the photo above the headline group.
  if (s.datum) {
    const x = quer ? fotoRect.x + fotoRect.width - gap - r : inner.x + inner.width - r;
    const y = quer ? Math.max(inner.y + r, groupTop - gap - r) : fotoRect.y + fotoRect.height;
    stoerer(p, f, 'pr-datum', s.datum, x, y, r);
  }
  addImpressum(p, f, spec.impressum);
  return p.out;
}

/**
 * V2 (p. 26–28): Tanne with the flower cut top right, the headline group, then
 * each speaker beside a round portrait, the rows stepping in and out; the date
 * in the Störer, the place and the sender at the foot.
 */
function veranstaltungPortraits(
  f: Frame,
  spec: Extract<PlakatSpec, { variante: 'veranstaltung' }>,
  src: PhotoSrc
): ComposedSlide {
  const { inner, trim, u } = f;
  const s = spec.slots;
  const quer = trim.width > trim.height;
  const gap = 1.2 * u;
  const p = page(TANNE);
  const blumeSize = 0.45 * f.shortSide;
  blume(p, f, 1, 0.02, blumeSize);

  const groupWidth = inner.width * (quer ? 0.62 : 0.74);
  const group = fitStack(
    f,
    (size) => aussage(f, s, size),
    0.1 * f.shortSide,
    groupWidth,
    inner.height * (quer ? 0.28 : 0.34)
  );
  const groupHeight = stackHeight(f, group, groupWidth);
  placeStack(p, f, group, inner.x, inner.y, groupWidth);

  const r = 0.1 * f.shortSide;
  const web = s.web ? absender(f, s.web, 0.0962, inner.width) : null;
  const webH = web ? blockHeight(f, web, inner.width) : 0;
  const bottom = inner.y + inner.height;
  if (web) p.text({ ...web.props, x: inner.x, y: bottom - webH, width: inner.width });
  const footTop = bottom - webH - gap;

  // The place sits left of the date Störer above the sender.
  const ortWidth = inner.width - 2 * r - gap;
  const ort = s.ort ? fitWords(f, [ortBlock(f, s.ort, 0.045 * f.shortSide, 0)], ortWidth) : [];
  const ortH = stackHeight(f, ort, ortWidth);
  placeStack(p, f, ort, inner.x, footTop - ortH, ortWidth);
  if (s.datum) stoerer(p, f, 'pr-datum', s.datum, inner.x + inner.width - r, footTop - r, r);

  const people = s.mitwirkende ?? [];
  // Landscape (p. 28): two columns; the Störer stands beside the place line
  // and only takes room from the rows when the right column runs full.
  const columns = quer ? 2 : 1;
  const perColumn = Math.ceil(people.length / columns);
  const rightFull = quer && people.length % 2 === 0;
  const rowsTop = inner.y + groupHeight + 2 * gap;
  const rowsBottom = footTop - Math.max(ortH, s.datum && (!quer || rightFull) ? 1.2 * r : 0) - gap;
  const rowHeight = perColumn ? (rowsBottom - rowsTop) / perColumn : 0;
  const columnWidth = (inner.width - (columns - 1) * gap * 2) / columns;
  const d = Math.min(0.2 * f.shortSide, rowHeight * 0.9);
  people.forEach((m, i) => {
    const col = Math.floor(i / perColumn);
    const row = i % perColumn;
    // Upright rows step in and out (p. 27).
    const step = !quer && row % 2 === 1 ? 0.12 * inner.width : 0;
    const x = inner.x + col * (columnWidth + gap * 2) + step;
    const y = rowsTop + row * rowHeight;
    if (m.foto) {
      p.image({
        id: `pr-portrait-${i}`,
        src: src(m.foto),
        fileName: m.foto,
        x,
        y: y + (rowHeight - d) / 2,
        width: d,
        height: d,
        rotation: 0,
        scale: 1,
        opacity: 1,
        fit: 'cover',
        mask: 'kreis',
      });
    }
    const textX = m.foto ? x + d + gap : x;
    // Upright, the text keeps clear of the date Störer at the right.
    const right = quer ? x - step + columnWidth : inner.x + inner.width - 2 * r - gap;
    const width = right - textX;
    const blocks = fitStack(
      f,
      (size) => personBlocks(f, m, i, size, true),
      0.055 * f.shortSide,
      width,
      rowHeight * 0.95
    );
    const h = stackHeight(f, blocks, width);
    placeStack(p, f, blocks, textX, y + (rowHeight - h) / 2, width);
  });

  addImpressum(p, f, spec.impressum);
  return p.out;
}

export function plakatDe(f: Frame, spec: PlakatSpec, src: PhotoSrc = printFotoSrc): ComposedSlide {
  if (spec.variante !== 'veranstaltung') return fotoPlakat(f, spec, src);
  if (spec.stil === 'portraits' || !spec.slots.foto) return veranstaltungPortraits(f, spec, src);
  return veranstaltungFoto(f, spec, spec.slots.foto, src);
}

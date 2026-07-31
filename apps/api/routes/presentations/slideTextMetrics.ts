/**
 * Server-side text measurement for the PPTX export, in the deck's own fonts.
 *
 * The on-screen slide is a flex column (`.gruene-slide`): the title takes its
 * natural height, the body gets the rest. Everything the PPTX export wants to
 * place below the title — the body box, the card grid, the numbered pills —
 * therefore depends on how tall the title actually wrapped, and auto-fit
 * depends on how tall the whole column is. Neither is knowable without
 * measuring text, so the export used to hardcode a body top and delegate
 * shrinking to PowerPoint.
 *
 * `@napi-rs/canvas` is already an apps/api dependency (the sharepic renderers
 * use it) and the deck's fonts already ship under `apps/api/public/fonts`, so
 * measuring here costs no new moving parts.
 *
 * Faces are registered under private aliases rather than their real family
 * names: `registerFromPath` also exposes the font's own family, and on a host
 * that has e.g. a system "PT Sans" installed the shorthand would be ambiguous.
 * The aliases make the selection ours.
 */

import path from 'path';
import { fileURLToPath } from 'url';

import { type PresentationBrand } from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';

const log = createLogger('slideTextMetrics');

const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../public/fonts');

/** Alias → font file, mirroring the `--deck-*-font` stacks in gruene-deck.css. */
const FACE_FILES: Record<string, string> = {
  'Deck-DE-Head': 'GrueneTypeNeue-Regular.ttf',
  'Deck-DE-Body': 'PTSans-Regular.ttf',
  'Deck-DE-BodyBold': 'PTSans-Bold.ttf',
  'Deck-AT-Head': 'GothamNarrow-Ultra.ttf',
  'Deck-AT-Body': 'GothamNarrow-Book.otf',
  'Deck-AT-BodyBold': 'GothamNarrow-Bold.otf',
  'Deck-Quote': 'Vollkorn-BoldItalic.ttf',
};

/** The four roles a measured run can take, as registered alias names. */
export interface DeckFaces {
  heading: string;
  body: string;
  bodyBold: string;
  /** Quote face, or null when the brand quotes in the body face (de-DE). */
  quote: string | null;
}

const FACES: Record<PresentationBrand, DeckFaces> = {
  'de-DE': {
    heading: 'Deck-DE-Head',
    body: 'Deck-DE-Body',
    bodyBold: 'Deck-DE-BodyBold',
    quote: null,
  },
  'de-AT': {
    heading: 'Deck-AT-Head',
    body: 'Deck-AT-Body',
    bodyBold: 'Deck-AT-BodyBold',
    quote: 'Deck-Quote',
  },
};

export function deckFaces(brand: PresentationBrand): DeckFaces {
  return FACES[brand];
}

/**
 * The measuring context, or null when canvas/fonts are unavailable. Loaded once
 * and cached — including the failure, so a broken install costs one attempt and
 * the export silently keeps its pre-measurement geometry.
 */
type Measurer = { measure: (text: string, font: string) => number };
let cached: Measurer | null | undefined;

async function getMeasurer(): Promise<Measurer | null> {
  if (cached !== undefined) return cached;
  try {
    const { createCanvas, GlobalFonts } = await import('@napi-rs/canvas');
    for (const [alias, file] of Object.entries(FACE_FILES)) {
      // A missing/unreadable file returns falsy rather than throwing — without
      // the check the alias silently measures in the fallback face.
      if (!GlobalFonts.registerFromPath(path.join(FONT_DIR, file), alias)) {
        log.warn(`Deck-Schrift ${alias} nicht registriert (${file}) — Maße werden geschätzt`);
      }
    }
    const ctx = createCanvas(8, 8).getContext('2d');
    cached = {
      measure: (text, font) => {
        ctx.font = font;
        return ctx.measureText(text).width;
      },
    };
  } catch (err) {
    log.warn('Textmessung nicht verfügbar — Export nutzt feste Geometrie', err);
    cached = null;
  }
  return cached;
}

/** Whether measurement is usable; callers fall back to fixed geometry if not. */
export async function metricsReady(): Promise<boolean> {
  return (await getMeasurer()) !== null;
}

/** One styled span of a paragraph, as far as measurement cares. */
export interface MeasureRun {
  text: string;
  bold?: boolean | undefined;
  /** Code spans render in a monospace face the deck does not ship a file for. */
  mono?: boolean | undefined;
}

export interface WrapOpts {
  /** Available inline size in slide px. */
  maxWidthPx: number;
  /** Font size in slide px (already multiplied by the type scale). */
  fontPx: number;
  faces: DeckFaces;
  /** Force one face for every run (quote layout, headings). */
  face?: string | null;
  /** Treat every run as bold (headings, the AT quote). */
  bold?: boolean;
}

function shorthand(run: MeasureRun, opts: WrapOpts): string {
  if (opts.face) return `${opts.fontPx}px "${opts.face}"`;
  if (run.mono) return `${opts.fontPx}px monospace`;
  const family = run.bold || opts.bold ? opts.faces.bodyBold : opts.faces.body;
  return `${opts.fontPx}px "${family}"`;
}

/**
 * Greedy line count for a paragraph of styled runs, the way a browser breaks
 * it: whitespace-separated, never inside a word (`overflow-wrap: normal`, so an
 * over-long word overflows rather than splitting) and honouring hard breaks.
 *
 * Returns 1 for empty input — an empty paragraph still occupies a line box.
 *
 * CONCURRENCY: the measuring 2d context is a module-wide singleton with mutable
 * `ctx.font`, shared by every in-flight export. That is safe only because the
 * walk below is synchronous — the single `await` is the first statement, so no
 * other export can interleave once measuring has started. Do not add an `await`
 * inside the loop; two exports would then trade fonts mid-paragraph and the
 * wrong widths would surface as silently misplaced boxes, not as an error.
 */
export async function countLines(runs: MeasureRun[], opts: WrapOpts): Promise<number> {
  const m = await getMeasurer();
  if (!m) return 1;

  let lines = 1;
  let x = 0;
  for (const run of runs) {
    const font = shorthand(run, opts);
    // Keep the separators: trailing spaces still advance the pen mid-line.
    for (const part of run.text.split(/(\s+)/)) {
      if (part === '') continue;
      const breaks = (part.match(/\n/g) ?? []).length;
      if (breaks > 0) {
        lines += breaks;
        x = 0;
        continue;
      }
      const w = m.measure(part, font);
      if (/^\s+$/.test(part)) {
        if (x > 0) x += w;
        continue;
      }
      if (x > 0 && x + w > opts.maxWidthPx) {
        lines += 1;
        x = w;
      } else {
        x += w;
      }
    }
  }
  return lines;
}

/** Wrapped height in slide px, i.e. line count × the CSS line box. */
export async function blockHeight(
  runs: MeasureRun[],
  opts: WrapOpts & { lineHeight: number }
): Promise<number> {
  const lines = await countLines(runs, opts);
  return lines * opts.fontPx * opts.lineHeight;
}

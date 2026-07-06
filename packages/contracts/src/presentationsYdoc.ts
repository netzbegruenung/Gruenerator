/**
 * Y.Doc layout and pure formatting helpers for reveal.js 'presentations'
 * documents.
 *
 * reveal-free on purpose: the editor (`packages/presentations`) and the API
 * (which ships without the reveal.js dependency tree) both import from here, so
 * the collab schema and the markdown-outline format have a single source of
 * truth. Unlike sheets there is no mutation log — slides are plain Yjs types
 * (`Y.Array<Y.Map>`), so the Y.Doc IS the state.
 */

import { type Slide } from './schemas/presentations.js';

/** Y keys of a presentation document's shared Y.Doc. */
export const PRESENTATION_YDOC_KEYS = {
  /** Y.Array<Y.Map> — one Y.Map per slide (fields mirror `Slide`). */
  slides: 'slides',
  /** Y.Map — deck-level metadata (seed guard, schema version, deck options). */
  meta: 'presentationMeta',
} as const;

export const PRESENTATION_META_KEYS = {
  /** boolean — set once the deck has been seeded with its initial slides. */
  seeded: 'seeded',
  schemaVersion: 'schemaVersion',
  /** reveal.js transition name applied deck-wide unless a slide overrides it. */
  defaultTransition: 'defaultTransition',
  /** number (ms) — auto-advance interval for kiosk mode; 0/absent disables. */
  autoSlide: 'autoSlide',
  /** boolean — loop back to the first slide after the last. */
  loop: 'loop',
  /** boolean — show reveal slide numbers in present mode. */
  slideNumber: 'slideNumber',
  /** string — deck brand accent colour; drives titles, markers, bars. */
  accentColor: 'accentColor',
} as const;

export const PRESENTATION_SCHEMA_VERSION = 1;

/** Default deck accent + the brand options offered in the "Marke" picker. */
export const PRESENTATION_DEFAULT_ACCENT = '#316049';

/** Sand tone used as a default background for some title/quote variants. */
export const PRESENTATION_SAND = '#f5f1e9';

/** The 16 basic CSS named colours plus a few brand-adjacent ones (hex, no #). */
const CSS_NAMED_COLORS: Record<string, string> = {
  black: '000000',
  silver: 'C0C0C0',
  gray: '808080',
  grey: '808080',
  white: 'FFFFFF',
  maroon: '800000',
  red: 'FF0000',
  purple: '800080',
  fuchsia: 'FF00FF',
  green: '008000',
  lime: '00FF00',
  olive: '808000',
  yellow: 'FFFF00',
  navy: '000080',
  blue: '0000FF',
  teal: '008080',
  aqua: '00FFFF',
  orange: 'FFA500',
};

/**
 * Normalise a CSS colour to a 6-digit uppercase hex string (no #), else null.
 * Accepts #rgb/#rrggbb, `rgb()/rgba()`, and common CSS named colours. Shared by
 * the on-screen surface and the PPTX exporter (which needs hex for pptxgenjs).
 */
export function normalizeCssColorToHex(color: string | null | undefined): string | null {
  if (!color) return null;
  const trimmed = color.trim();
  const raw = trimmed.replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return raw
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase();
  }
  const rgb = trimmed.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/i);
  if (rgb) {
    return [rgb[1], rgb[2], rgb[3]]
      .map((n) =>
        Math.min(255, parseInt(n ?? '0', 10))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
      .toUpperCase();
  }
  return CSS_NAMED_COLORS[trimmed.toLowerCase()] ?? null;
}

/**
 * Perceived-luminance dark test for a deck colour. Shared by the on-screen
 * surface (`SlideSurface`) and the PPTX exporter so both classify text
 * light/dark identically. Unrecognised strings fall back to a prefix heuristic.
 */
export function isDeckColorDark(color: string): boolean {
  const hex = normalizeCssColorToHex(color);
  if (!hex) return /^#(00|31|0c|1b)/i.test(color);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/**
 * Default background for a (layout, variant): title 0→accent / 1→white / 2→sand;
 * quote 0→accent / 1→sand; everything else white. A slide's own `background`
 * overrides this. Shared by `SlideSurface` and the PPTX exporter.
 */
export function defaultDeckBackground(
  layout: Slide['layout'],
  variant: number,
  accent: string
): string {
  if (layout === 'title') return [accent, '#ffffff', PRESENTATION_SAND][variant] ?? accent;
  if (layout === 'quote') return [accent, PRESENTATION_SAND][variant] ?? accent;
  return '#ffffff';
}
export const PRESENTATION_ACCENT_OPTIONS: { value: string; name: string }[] = [
  { value: '#316049', name: 'Tanne' },
  { value: '#005538', name: 'Dunkelgrün' },
  { value: '#52907A', name: 'Klee' },
];

/** Max characters the markdown-outline renderer emits (AI context cap). */
export const PRESENTATION_CONTEXT_MAX = 20_000;

/**
 * Render a deck as a numbered markdown outline for the AI context. Shared by
 * the frontend serializer (`serializePresentationContext`) and the backend
 * context loader (`formatPresentationAsContext`) so both speak the exact same
 * numbering the AI ops address slides by.
 */
export function formatSlidesAsMarkdown(slides: readonly Slide[], title: string): string {
  const header = `Präsentation: „${title || 'Ohne Titel'}" (${slides.length} Folien)\n`;
  const parts: string[] = [header];

  slides.forEach((slide, i) => {
    const num = i + 1;
    let block = `\n## Folie ${num} (Layout: ${slide.layout}): ${slide.title || '(ohne Titel)'}`;
    if (slide.body.trim()) block += `\n${slide.body.trim()}`;
    if (slide.notes.trim()) block += `\nNotizen: ${slide.notes.trim()}`;
    parts.push(block);
  });

  const out = parts.join('\n');
  return out.length > PRESENTATION_CONTEXT_MAX
    ? `${out.slice(0, PRESENTATION_CONTEXT_MAX)}\n… (gekürzt)`
    : out;
}

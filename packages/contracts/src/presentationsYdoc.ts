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

import { type Slide, type SlideFontSize } from './schemas/presentations.js';

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
  /** 'de-DE' | 'de-AT' — country CI, written once from the creator's locale.
   * Never user-facing; drives fonts, palettes, and the logo everywhere. */
  brand: 'brand',
  /** boolean — render the party logo on title-layout slides (default true). */
  showLogo: 'showLogo',
} as const;

export const PRESENTATION_SCHEMA_VERSION = 1;

/**
 * Multiplier each font-size preset applies to the deck's base type scale
 * (28px body / 44-56px titles on the 960×540 surface). Shared by the web
 * renderer (CSS `--gs-font-scale`), the PPTX export (pt sizes), and mobile.
 * Tuning a value here restyles existing decks — no data migration.
 */
export const PRESENTATION_FONT_SIZE_SCALE: Record<SlideFontSize, number> = {
  xs: 0.6,
  s: 0.8,
  m: 1,
  l: 1.15,
  xl: 1.35,
};

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
    const fontTag = slide.fontSize ? ` [Schriftgröße: ${slide.fontSize.toUpperCase()}]` : '';
    let block = `\n## Folie ${num} (Layout: ${slide.layout})${fontTag}: ${slide.title || '(ohne Titel)'}`;
    if (slide.body.trim()) block += `\n${slide.body.trim()}`;
    if (slide.notes.trim()) block += `\nNotizen: ${slide.notes.trim()}`;
    parts.push(block);
  });

  const out = parts.join('\n');
  return out.length > PRESENTATION_CONTEXT_MAX
    ? `${out.slice(0, PRESENTATION_CONTEXT_MAX)}\n… (gekürzt)`
    : out;
}

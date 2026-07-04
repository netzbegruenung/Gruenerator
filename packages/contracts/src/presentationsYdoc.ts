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

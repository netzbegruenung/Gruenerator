import { type SlideFontSize, type SlideLayout, type SlideTransition } from '@gruenerator/contracts';

export const LAYOUT_LABELS: Record<SlideLayout, string> = {
  title: 'Titel',
  content: 'Inhalt',
  split: 'Zweispaltig',
  quote: 'Zitat',
  image: 'Bild',
  code: 'Code',
};
export const LAYOUTS = Object.keys(LAYOUT_LABELS) as SlideLayout[];

export const TRANSITION_LABELS: Record<SlideTransition, string> = {
  none: 'Keine',
  fade: 'Verblassen',
  slide: 'Schieben',
  convex: 'Konvex',
  concave: 'Konkav',
  zoom: 'Zoom',
};
export const TRANSITIONS = Object.keys(TRANSITION_LABELS) as SlideTransition[];

/** Font-size segments; null = auto-fit (shrink to fit the slide). */
export const FONT_SIZE_OPTIONS: { value: SlideFontSize | null; label: string }[] = [
  { value: null, label: 'Auto' },
  { value: 'xs', label: 'XS' },
  { value: 's', label: 'S' },
  { value: 'm', label: 'M' },
  { value: 'l', label: 'L' },
  { value: 'xl', label: 'XL' },
];

/**
 * Design-variant names per layout (index = the slide's `variant`). Layouts not
 * listed have no variants. Mirrors the SlideSurface CSS variant classes.
 */
export const VARIANT_NAMES: Partial<Record<SlideLayout, string[]>> = {
  title: ['Klassisch', 'Geteilt', 'Sand'],
  content: ['Liste', 'Karten', 'Nummeriert'],
  quote: ['Grün', 'Sand'],
  image: ['Groß', 'Geteilt'],
};

import { type SlideLayout, type SlideTransition } from '@gruenerator/contracts';

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

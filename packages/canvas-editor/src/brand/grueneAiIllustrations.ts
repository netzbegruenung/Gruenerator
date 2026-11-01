/**
 * The illustrations the AI planner may reference (`add-illustration`): a
 * hand-picked subset of the Grünerator's sets, since the full unDraw registry
 * has 1600+ entries — too many for an LLM prompt. Kept as plain ids so this
 * module never loads the ~280 KB catalog (it must stay in a lazy chunk). A
 * vitest (curatedIllustrations.vitest.ts) asserts every id still resolves
 * against the catalog, so a registry rename can't silently degrade the AI
 * surface. Keep the list short (~20) so prompt cost stays low.
 */
import type { CanvasAiNamedOption } from '@ggraphic/editor/ai/types';

const CURATED_UNDRAW: CanvasAiNamedOption[] = [
  { id: 'ud-election-day', label: 'Wahltag' },
  { id: 'ud-environment', label: 'Umwelt' },
  { id: 'ud-among-nature', label: 'Among Nature' },
  { id: 'ud-everywhere-together', label: 'Everywhere Together' },
  { id: 'ud-design-community', label: 'Design Community' },
  { id: 'ud-eating-together', label: 'Eating Together' },
  { id: 'ud-bright-ideas', label: 'Bright Ideas' },
  { id: 'ud-conceptual-idea', label: 'Conceptual Idea' },
  { id: 'ud-electric-car', label: 'Elektroauto' },
  { id: 'ud-electricity', label: 'Electricity' },
  { id: 'ud-growth-analytics', label: 'Growth Analytics' },
  { id: 'ud-growth-curve', label: 'Growth Curve' },
];

// Hand-mirrored from the opendoodles set so this module doesn't need to load its SVG metadata.
// If a name there changes, update here.
const OPENDOODLES_FOR_AI: CanvasAiNamedOption[] = [
  { id: 'od-doggie', label: 'Hund' },
  { id: 'od-ballet', label: 'Ballett' },
  { id: 'od-coffee', label: 'Kaffee' },
  { id: 'od-dancing', label: 'Tanzen' },
  { id: 'od-chilling', label: 'Entspannen' },
  { id: 'od-float', label: 'Schweben' },
  { id: 'od-groovy', label: 'Groovy' },
];

export const GRUENE_AI_ILLUSTRATIONS: readonly CanvasAiNamedOption[] = [
  ...CURATED_UNDRAW,
  ...OPENDOODLES_FOR_AI,
];

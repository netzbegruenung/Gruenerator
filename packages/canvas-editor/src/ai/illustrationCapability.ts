/**
 * Curated illustration capability for AI prompts.
 *
 * The full undraw registry has 1600+ illustrations — too many to fit in an
 * LLM prompt. We expose a hand-picked subset of politically-relevant
 * illustrations, plus the lightweight Opendoodles set.
 *
 * Adding a new id here lets the AI reference it via `add-illustration`.
 * The applier (utils/illustrations/registry.createIllustration) will
 * resolve it at apply time.
 */
import type { CanvasAiNamedOption } from './types';

/**
 * Hand-picked Undraw illustrations relevant to political / civic content
 * for Die Grünen, mirrored from utils/illustrations/undrawAll.ts so this
 * module never loads the ~280 KB catalog (it must stay in a lazy chunk).
 * A vitest (curatedIllustrations.vitest.ts) asserts every id still resolves
 * against the catalog, so a registry rename can't silently degrade the AI
 * surface. Keep this list short (~20) so prompt cost stays low.
 */
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

/**
 * Build the AI illustration capability list. Returns a curated set of
 * `{id, label}` pairs the LLM can use for `add-illustration` operations.
 */
export function buildIllustrationCapability(): CanvasAiNamedOption[] {
  return [...CURATED_UNDRAW, ...OPENDOODLES_FOR_AI];
}

// Hand-mirrored from utils/illustrations/opendoodles.ts so this module
// doesn't need to load the full opendoodles SVG metadata at runtime.
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

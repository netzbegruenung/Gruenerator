/**
 * Curated illustration capability for AI prompts.
 *
 * The full undraw registry has 1600+ illustrations — too many to fit in an
 * LLM prompt. We expose a hand-picked subset of politically-relevant
 * illustrations, plus the lightweight Opendoodles set (33 items).
 *
 * Adding a new id here lets the AI reference it via `add-illustration`.
 * The applier (utils/illustrations/registry.createIllustration) will
 * resolve it at apply time.
 */
import { UNDRAW_ALL } from '../utils/illustrations/undrawAll';

import type { CanvasAiNamedOption } from './types';

/**
 * Hand-picked Undraw illustrations relevant to political / civic content
 * for Die Grünen. Keep this list short (~20) so prompt cost stays low.
 *
 * Each id is verified against UNDRAW_ALL at build time via the helper
 * below — unknown ids are filtered out so a registry rename doesn't
 * silently degrade the AI surface.
 */
const CURATED_UNDRAW_IDS = [
  'ud-election-day',
  'ud-environment',
  'ud-among-nature',
  'ud-everywhere-together',
  'ud-design-community',
  'ud-eating-together',
  'ud-bright-ideas',
  'ud-conceptual-idea',
  'ud-electric-car',
  'ud-electricity',
  'ud-growth-analytics',
  'ud-growth-curve',
] as const;

/**
 * Build the AI illustration capability list. Returns a curated set of
 * `{id, label}` pairs the LLM can use for `add-illustration` operations.
 */
export function buildIllustrationCapability(): CanvasAiNamedOption[] {
  const undrawById = new Map(UNDRAW_ALL.map((u) => [u.id, u]));
  const undrawCurated: CanvasAiNamedOption[] = CURATED_UNDRAW_IDS.flatMap((id) => {
    const def = undrawById.get(id);
    return def ? [{ id: def.id, label: def.name }] : [];
  });

  // Opendoodles is small enough to expose entirely. Lazy-imported via a
  // dynamic require would defeat tree-shaking; instead we bake in the
  // lightweight metadata here.
  const opendoodles: CanvasAiNamedOption[] = OPENDOODLES_FOR_AI;

  return [...undrawCurated, ...opendoodles];
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

/**
 * Registry der Pipeline-Agenten.
 *
 * Ein Eintrag hier ersetzt vier verstreute `if (isEinfacheSpracheAgent(...))`
 * im Router. Wer einen weiteren Übertragungs-Agenten aufnehmen will, schreibt
 * einen `buildTransferPipeline`-Aufruf und trägt ihn unten ein — der Router
 * bleibt unberührt.
 */

import { EINFACHE_SPRACHE_PIPELINE } from './einfacheSprache.js';
import { LEICHTE_SPRACHE_PIPELINE } from './leichteSprache.js';

import type { PipelineAgent } from './types.js';

const PIPELINE_AGENTS: readonly PipelineAgent[] = [
  EINFACHE_SPRACHE_PIPELINE,
  LEICHTE_SPRACHE_PIPELINE,
];

const BY_IDENTIFIER = new Map(PIPELINE_AGENTS.map((p) => [p.identifier, p]));

/**
 * Die Pipeline dieses Agenten, oder null für jeden gewöhnlichen Agenten.
 *
 * `null` ist der Normalfall und bedeutet „nichts Besonderes tun" — der Router
 * fragt an fünf Stellen danach, und alle fünf müssen ohne Eintrag genau das
 * bisherige Verhalten zeigen.
 */
export function getPipelineAgent(identifier: string | null | undefined): PipelineAgent | null {
  if (!identifier) return null;
  return BY_IDENTIFIER.get(identifier) ?? null;
}

/** Ob dieser Agent seine Persona aus dem Repo bezieht statt aus `INTERN_CONTENT_DIR`. */
export function getPipelineSystemRole(identifier: string): string | null {
  return BY_IDENTIFIER.get(identifier)?.systemRole ?? null;
}

export { type PipelineAgent, type PipelineStep, type MaterialState } from './types.js';

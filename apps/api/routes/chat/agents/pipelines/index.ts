/**
 * Registry der Pipeline-Agenten.
 *
 * Ein Eintrag hier ersetzt vier verstreute `if (isEinfacheSpracheAgent(...))`
 * im Router. Wer einen weiteren Übertragungs-Agenten aufnehmen will, schreibt
 * einen `buildTransferPipeline`-Aufruf und trägt ihn unten ein — der Router
 * bleibt unberührt.
 */

import { canonicalSkillMention, DEFAULT_SYSTEM_AGENT_ID } from '@gruenerator/shared/agents';

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

const BY_RECIPE = new Map(PIPELINE_AGENTS.map((p) => [p.recipeMention, p]));

/**
 * Die Pipeline, die ein Rezept auslöst, oder null für jedes gewöhnliche Rezept.
 *
 * Ein Rezept-Text kann keine Kette mit getrennten Kontexten ausführen; das
 * Rezept ist deshalb nur der Auslöser, und der Turn übernimmt den ganzen
 * Pipeline-Agenten (`initializeChatState`).
 */
export function getPipelineAgentForRecipe(
  mention: string | null | undefined
): PipelineAgent | null {
  if (!mention) return null;
  return BY_RECIPE.get(canonicalSkillMention(mention).toLowerCase()) ?? null;
}

/**
 * Der Pipeline-Agent, den ein Turn statt des Standard-Agenten fährt, weil sein
 * Übertragungs-Rezept das Rezept des Turns ist — oder null. Ein ausdrücklich
 * gewählter anderer Agent gewinnt immer, wie bei jedem Rezept-Zuschnitt.
 */
export function recipePipelineAgentId(
  agentId: string | null | undefined,
  recipeMention: string | null | undefined
): string | null {
  if ((agentId || DEFAULT_SYSTEM_AGENT_ID) !== DEFAULT_SYSTEM_AGENT_ID) return null;
  return getPipelineAgentForRecipe(recipeMention)?.identifier ?? null;
}

/** Rezept-Mention → Regelwerk der Fassung; der Rumpf der Übertragungs-Rezepte. */
export function pipelineRecipeBodies(): ReadonlyMap<string, string> {
  return new Map(
    PIPELINE_AGENTS.flatMap((p) => (p.systemRole ? [[p.recipeMention, p.systemRole] as const] : []))
  );
}

/** Ob dieser Agent seine Persona aus dem Repo bezieht statt aus `INTERN_CONTENT_DIR`. */
export function getPipelineSystemRole(identifier: string): string | null {
  return BY_IDENTIFIER.get(identifier)?.systemRole ?? null;
}

export { type PipelineAgent, type PipelineStep, type MaterialState } from './types.js';

import type { ThreadMode } from '../stores/chatStore';
import type { Agent } from '@gruenerator/shared/agents';
import type { TextModelId } from '@gruenerator/shared/models';

export const AUTO_MODEL_ID = 'auto' as const;
export type AutoModelId = typeof AUTO_MODEL_ID;

/**
 * The "Automatisch" model option, shared so web and mobile present it identically.
 * Selecting it defers the model choice to `resolveAutoModel` (context-aware); it is the
 * default selection on both platforms.
 */
export const AUTO_MODEL_OPTION = {
  id: AUTO_MODEL_ID,
  name: 'Automatisch',
  description: 'Wählt je Aufgabe das Modell',
  /**
   * Steht im aufgeklappten Wähler neben dem Namen. Hier und nicht je Plattform
   * als Literal, weil es sonst zwei Stellen wären, die auseinanderlaufen —
   * genau der Grund, aus dem COMPOSER_MODES existiert.
   */
  recommendedLabel: 'Empfohlen',
} as const;

export type SelectedModel = TextModelId | AutoModelId;

export interface AutoResolverContext {
  threadMode: ThreadMode;
  agent: Agent | null;
}

export function resolveAutoModel(ctx: AutoResolverContext): TextModelId {
  // Ultra ist die Notizbuch-Vorgabe; außerhalb bleibt es bei den bisherigen
  // Zuordnungen (Mittel allgemein/kreativ, Ultra für anweisungslastige Agenten
  // wie den Agenten-Ersteller).
  if (ctx.threadMode === 'notebook') return 'gruenerator-ultra';
  if (ctx.agent?.autoRoutingHint === 'precise') return 'gruenerator-ultra';
  if (ctx.agent?.autoRoutingHint === 'creative') return 'gruenerator-medium';
  return 'gruenerator-medium';
}

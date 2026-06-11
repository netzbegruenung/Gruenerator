import type { TextModelId } from '@gruenerator/shared/models';
import type { Agent } from '@gruenerator/shared/agents';
import type { ThreadMode } from '../stores/chatStore';

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
  description: 'Modell passend zum Kontext',
} as const;

export type SelectedModel = TextModelId | AutoModelId;

export interface AutoResolverContext {
  threadMode: ThreadMode;
  agent: Agent | null;
}

export function resolveAutoModel(ctx: AutoResolverContext): TextModelId {
  // Mistral Medium 3.5 is the notebook default; outside notebooks the
  // previous defaults stay (Gemma general/creative, Mistral for
  // instruction-heavy agents like the agent creator).
  if (ctx.threadMode === 'notebook') return 'mistral-medium-3.5';
  if (ctx.agent?.autoRoutingHint === 'precise') return 'mistral-medium-3.5';
  if (ctx.agent?.autoRoutingHint === 'creative') return 'gemma-litellm';
  return 'gemma-litellm';
}

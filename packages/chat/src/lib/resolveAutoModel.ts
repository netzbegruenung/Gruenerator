import type { ModelId } from '@gruenerator/shared/models';
import type { Agent } from '@gruenerator/shared/agents';
import type { ThreadMode } from '../stores/chatStore';

export const AUTO_MODEL_ID = 'auto' as const;
export type AutoModelId = typeof AUTO_MODEL_ID;

export type SelectedModel = ModelId | AutoModelId;

export interface AutoResolverContext {
  threadMode: ThreadMode;
  agent: Agent | null;
}

export function resolveAutoModel(ctx: AutoResolverContext): ModelId {
  if (ctx.threadMode === 'notebook') return 'mistral-medium-3.5';
  if (ctx.agent?.autoRoutingHint === 'creative') return 'gemma-litellm';
  return 'litellm';
}

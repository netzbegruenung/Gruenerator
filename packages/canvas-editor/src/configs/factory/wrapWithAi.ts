import { createChatSection } from '../commonSections';

import type { CanvasAiActionsBase } from '@ggraphic/editor/ai/applyOperation';
import type { CanvasConfigId } from '../../templates/registry';
import type { SharepicAiCapabilities } from '../aiCapabilities';
import type { FullCanvasConfig } from '@ggraphic/editor/configs/types';

/**
 * Overlays the AI capability declaration + capability-aware chat section onto
 * a factory-built canvas config. The base config keeps its tabs, sections,
 * elements, layout, and actions verbatim.
 */
export function wrapWithAi<TState, TActions extends CanvasAiActionsBase>(
  base: FullCanvasConfig<TState, TActions>,
  id: CanvasConfigId,
  capabilities: SharepicAiCapabilities<TState, TActions>
): FullCanvasConfig<TState, TActions> {
  return {
    ...base,
    ai: capabilities,
    sections: {
      ...base.sections,
      chat: createChatSection(id, capabilities),
    },
  };
}

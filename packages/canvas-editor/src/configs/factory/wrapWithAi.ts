import { createChatSection } from '../commonSections';

import type { CanvasAiActionsBase } from '../../ai/applyOperation';
import type { TemplateAiCapabilities } from '../../ai/types';
import type { CanvasConfigId, FullCanvasConfig } from '../types';

/**
 * Overlays the AI capability declaration + capability-aware chat section onto
 * a factory-built canvas config. The base config keeps its tabs, sections,
 * elements, layout, and actions verbatim.
 */
export function wrapWithAi<TState, TActions extends CanvasAiActionsBase>(
  base: FullCanvasConfig<TState, TActions>,
  id: CanvasConfigId,
  capabilities: TemplateAiCapabilities<TState, TActions>
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

import { HiSparkles } from 'react-icons/hi';

import { createAiSectionRegistration } from '../../ai/createAiSectionRegistration';
import { createChatSection } from '../commonSections';

import type { CanvasAiActionsBase } from '../../ai/applyOperation';
import type { TemplateAiCapabilities } from '../../ai/types';
import type { SidebarTab } from '../../sidebar/types';
import type { CanvasConfigId, FullCanvasConfig } from '../types';

const AI_TAB: SidebarTab = {
  id: 'ai',
  icon: HiSparkles,
  label: 'KI',
  ariaLabel: 'KI-Vorschläge',
};

/**
 * Overlays the AI tab + AI section + capability-aware chat section onto a
 * factory-built canvas config. The base config keeps its tabs, sections,
 * elements, layout, and actions verbatim.
 *
 * The 'ai' tab is registered but intentionally not added to `getVisibleTabs`
 * — chat drives canvas-AI suggestions, the tab exists only so AiSection has
 * a registration to mount against.
 */
export function wrapWithAi<TState, TActions extends CanvasAiActionsBase>(
  base: FullCanvasConfig<TState, TActions>,
  id: CanvasConfigId,
  capabilities: TemplateAiCapabilities<TState, TActions>
): FullCanvasConfig<TState, TActions> {
  return {
    ...base,
    ai: capabilities,
    tabs: [...base.tabs, AI_TAB],
    sections: {
      ...base.sections,
      ai: createAiSectionRegistration(id, capabilities),
      chat: createChatSection(id, capabilities),
    },
  };
}

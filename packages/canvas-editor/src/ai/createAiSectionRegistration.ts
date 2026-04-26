/**
 * Helper that produces a sidebar-section registration object from a
 * TemplateAiCapabilities declaration.
 *
 * Returns a fully-typed `SectionConfig` — the consumer
 * (FullCanvasConfig.sections) accepts strongly-typed section configs
 * via its documented `any` slot for component props (per the eslint-disable
 * comment in configs/types.ts). No `as unknown` casts needed.
 */
import { AiSection, type AiSectionProps } from '../sidebar/sections/AiSection';

import type { CanvasAiActionsBase } from './applyOperation';
import type { TemplateAiCapabilities } from './types';
import type { SectionConfig, SectionContext } from '../configs/types';

export function createAiSectionRegistration<TState, TActions extends CanvasAiActionsBase>(
  canvasType: string,
  capabilities: TemplateAiCapabilities<TState, TActions>
): SectionConfig<TState, TActions, AiSectionProps<TState, TActions>> {
  const propsFactory = (
    state: TState,
    actions: TActions,
    _context?: SectionContext
  ): AiSectionProps<TState, TActions> => ({
    canvasType,
    capabilities,
    actions,
    // State at apply-time is fresh enough — propsFactory re-runs every render.
    getState: () => state,
  });

  return {
    component: AiSection<TState, TActions>,
    propsFactory,
  };
}

/**
 * Helper that produces a sidebar-section registration from a
 * TemplateAiCapabilities declaration.
 *
 * Built via `makeSectionDefiner`, so the `AiSection` component and the
 * `propsFactory` return are checked against each other at compile time and
 * the result carries the `SectionConfig` brand required by
 * `FullCanvasConfig.sections`.
 */
import { AiSection, type AiSectionProps } from '../sidebar/sections/AiSection';

import { makeSectionDefiner } from '../configs/factory/defineSection';

import type { CanvasAiActionsBase } from './applyOperation';
import type { TemplateAiCapabilities } from './types';
import type { SectionConfig } from '../configs/types';

export function createAiSectionRegistration<TState, TActions extends CanvasAiActionsBase>(
  canvasType: string,
  capabilities: TemplateAiCapabilities<TState, TActions>
): SectionConfig<TState, TActions, AiSectionProps<TState, TActions>> {
  const section = makeSectionDefiner<TState, TActions>();
  return section({
    component: AiSection<TState, TActions>,
    propsFactory: (state, actions) => ({
      canvasType,
      capabilities,
      actions,
      // State at apply-time is fresh enough — propsFactory re-runs every render.
      getState: () => state,
    }),
  });
}

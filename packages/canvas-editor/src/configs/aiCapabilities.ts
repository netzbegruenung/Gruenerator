import type { TemplateAiCapabilities } from '../ai/types';
import type { CanvasAiOperation, CanvasAiSnapshot } from '@gruenerator/contracts';

/**
 * The sharepic templates' binding of the AI capability declaration: the
 * Grünerator's composed operation union (core kinds plus `toggle-sunflower`)
 * and snapshot (core element kinds plus `balken`), both from
 * `@gruenerator/contracts`.
 */
export type SharepicAiCapabilities<
  TState = Record<string, unknown>,
  TActions = Record<string, unknown>,
> = TemplateAiCapabilities<TState, TActions, CanvasAiOperation, CanvasAiSnapshot>;

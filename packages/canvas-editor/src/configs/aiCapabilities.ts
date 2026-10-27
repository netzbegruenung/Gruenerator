import type { TemplateAiCapabilities } from '@ggraphic/editor/ai/types';
import type { CanvasAiOperation, CanvasAiSnapshot } from '@gruenerator/contracts';

/**
 * The sharepic templates' binding of the AI capability declaration: the
 * Grünerator's composed operation union (core kinds plus `toggle-sunflower`)
 * and snapshot (core element kinds plus `balken`), both from
 * `@gruenerator/contracts`. The augmentation binds them for
 * `FullCanvasConfig.ai` too.
 */
export type SharepicAiCapabilities<
  TState = Record<string, unknown>,
  TActions = Record<string, unknown>,
> = TemplateAiCapabilities<TState, TActions, CanvasAiOperation, CanvasAiSnapshot>;

declare module '@ggraphic/editor/ai/types' {
  interface CanvasAiHostTypes {
    operation: CanvasAiOperation;
    snapshot: CanvasAiSnapshot;
  }
}

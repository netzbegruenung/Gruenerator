import {
  parseSharepicChatProps,
  type CanvasTemplateType,
  type SharepicFormat,
} from '@gruenerator/contracts';

import { canvasSeed, composeCreatorSharepic } from './composeForRender';

export async function chatMintBody(variant: {
  canvasType: CanvasTemplateType;
  initialProps: Record<string, unknown>;
}): Promise<{
  canvasType: CanvasTemplateType;
  initialProps: Record<string, unknown>;
  format?: SharepicFormat;
}> {
  const creator = parseSharepicChatProps(variant.initialProps);
  if (!creator) return { canvasType: variant.canvasType, initialProps: variant.initialProps };
  const seed = canvasSeed(await composeCreatorSharepic(creator.creatorSpec, creator.attributions));
  return { canvasType: seed.templateType, initialProps: seed.initialState, format: seed.format };
}

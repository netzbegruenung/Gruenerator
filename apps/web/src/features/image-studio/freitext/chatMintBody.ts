import {
  parseSharepicChatProps,
  stripInlineMarks,
  type CanvasTemplateType,
  type SharepicFormat,
  type SharepicSpec,
} from '@gruenerator/contracts';

import { canvasSeed, composeCreatorSharepic } from './composeForRender';

const TITLE_MAX = 60;

/** The first slide's headline (else its first text item), without marker syntax. */
function creatorTitle(spec: SharepicSpec): string | null {
  const items = spec.slides[0]?.items ?? [];
  const headline = items.find((item) => item.type === 'headline');
  const candidates =
    headline?.type === 'headline'
      ? [headline.lines.join('\n')]
      : items.map((item) => ('text' in item && typeof item.text === 'string' ? item.text : ''));
  const text =
    candidates
      .map((raw) => stripInlineMarks(raw).replace(/\s+/g, ' ').trim())
      .find((t) => t.length > 0) ?? '';
  if (!text) return null;
  return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 3)}…` : text;
}

export async function chatMintBody(variant: {
  canvasType: CanvasTemplateType;
  initialProps: Record<string, unknown>;
}): Promise<{
  canvasType: CanvasTemplateType;
  initialProps: Record<string, unknown>;
  format?: SharepicFormat;
  title?: string;
}> {
  const creator = parseSharepicChatProps(variant.initialProps);
  if (!creator) return { canvasType: variant.canvasType, initialProps: variant.initialProps };
  const seed = canvasSeed(await composeCreatorSharepic(creator.creatorSpec, creator.attributions));
  const title = creatorTitle(creator.creatorSpec);
  return {
    canvasType: seed.templateType,
    initialProps: seed.initialState,
    format: seed.format,
    ...(title !== null && { title }),
  };
}

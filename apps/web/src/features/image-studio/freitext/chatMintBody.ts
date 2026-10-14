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
  const headlines = items.flatMap((item) =>
    item.type === 'headline' ? [item.lines.join('\n')] : []
  );
  const texts = items.map((item) =>
    'text' in item && typeof item.text === 'string' ? item.text : ''
  );
  const candidates = [...headlines, ...texts];
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
  const seed = canvasSeed(await composeCreatorSharepic(creator.creatorSpec, creator.attributions), {
    // The composition shows `creatorSpec`; the source keeps the untweaked base and the choice revertible.
    base: creator.creatorBase ?? creator.creatorSpec,
    tweaks: creator.creatorTweaks ?? {},
    attributions: creator.attributions,
  });
  const title = creatorTitle(creator.creatorSpec);
  return {
    canvasType: seed.templateType,
    initialProps: seed.initialState,
    format: seed.format,
    ...(title !== null && { title }),
  };
}

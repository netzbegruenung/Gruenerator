import { ApiError, getContractsClient } from '@gruenerator/shared/api';

import type { CanvasEditorServices } from '@gruenerator/canvas-editor';

export const generateSlideAltTexts: NonNullable<
  CanvasEditorServices['generateSlideAltTexts']
> = async (pages) => {
  const result = await getContractsClient().texte.generateSlideAltTexts({
    body: { slides: pages.map((page) => ({ imageBase64: page.image, texts: page.texts })) },
  });
  if (result.status !== 200) {
    throw new ApiError(result.status, 'Die Alt-Texte konnten nicht erstellt werden.');
  }
  return result.body.altTexts;
};

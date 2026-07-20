import { getContractsClient } from '@gruenerator/shared/api';

import { uploadBlobToMediaLibrary } from '../services/mediaUploadService';

/**
 * Hand the active image off to the sharepic canvas editor as a full-bleed
 * social-media background. Uploads the data-URL to a durable media URL (a
 * `data:` URL dies on reload and can't be resolved by collaborators), then
 * mints a `freeform` canvas with the image as its background and returns the
 * new canvas id to open at `/studio/canvas/:id`.
 */
export async function mintCanvasFromImage(imageDataUrl: string, title: string): Promise<string> {
  const blob = await (await fetch(imageDataUrl)).blob();
  const imageUrl = await uploadBlobToMediaLibrary(blob, { uploadSource: 'canvas-mint' });
  if (!imageUrl) throw new Error('Bild konnte nicht hochgeladen werden.');

  const result = await getContractsClient().canvas.create({
    body: {
      title,
      template_type: 'freeform',
      initial_state: {
        backgroundMode: 'image',
        currentImageSrc: imageUrl,
        hasBackgroundImage: true,
      },
      format: 'post-portrait',
      page_count: 1,
    },
  });

  if (result.status !== 201) {
    throw new Error(`Canvas konnte nicht erstellt werden (HTTP ${result.status}).`);
  }
  return result.body.id;
}

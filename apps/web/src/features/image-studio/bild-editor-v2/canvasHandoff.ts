import { pinnedFormatId } from '@gruenerator/canvas-editor/formats';
import { type CanvasDocument } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';

import { renderSharepicToImage } from '../renderSharepicToImage';
import { updateCanvasThumbnail } from '../services/canvasThumbnailService';
import { uploadBlobToMediaLibrary } from '../services/mediaUploadService';

/**
 * Hand the active image off to the sharepic canvas editor as a full-bleed
 * social-media background. Uploads the data-URL to a durable media URL (a
 * `data:` URL dies on reload and can't be resolved by collaborators), then
 * mints a `freeform` canvas with the image as its background and returns the
 * new canvas id to open at `/studio/canvas/:id`.
 */
export async function mintCanvasFromImage(
  imageDataUrl: string,
  title: string
): Promise<CanvasDocument> {
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
    throw new ApiError(
      result.status,
      `Canvas konnte nicht erstellt werden (HTTP ${result.status}).`
    );
  }
  return result.body;
}

/**
 * Hand a background-removed photo off to the profile-picture canvas. The
 * transparent PNG is uploaded for the same reason as above, then a
 * `profilbild` canvas is minted on its pinned square format.
 */
export async function mintProfilbildCanvas(
  transparentDataUrl: string,
  title: string
): Promise<CanvasDocument> {
  const blob = await (await fetch(transparentDataUrl)).blob();
  const transparentImage = await uploadBlobToMediaLibrary(blob, { uploadSource: 'canvas-mint' });
  if (!transparentImage) throw new Error('Bild konnte nicht hochgeladen werden.');

  const initialState = { transparentImage };
  const formatId = pinnedFormatId('profilbild') ?? 'profile-square';
  const result = await getContractsClient().canvas.create({
    body: {
      title,
      template_type: 'profilbild',
      initial_state: initialState,
      format: formatId,
      page_count: 1,
    },
  });
  if (result.status !== 201) {
    throw new ApiError(
      result.status,
      `Canvas konnte nicht erstellt werden (HTTP ${result.status}).`
    );
  }

  // Fire-and-forget: the render mounts its own offscreen root, so navigating to
  // the editor does not cancel it. Without it the gallery card stays blank
  // until the first export.
  const canvasId = result.body.id;
  void renderSharepicToImage('profilbild', initialState, { formatId })
    .then((dataUrl) =>
      dataUrl ? updateCanvasThumbnail(canvasId, dataUrl, 'canvas-mint-thumbnail') : undefined
    )
    .catch((err: unknown) => console.warn('[canvasHandoff] thumbnail generation failed:', err));

  return result.body;
}

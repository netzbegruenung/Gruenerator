import { pinnedFormatId } from '@gruenerator/canvas-editor/formats';
import { type CanvasDocument } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';

import { renderSharepicToImage } from '../image-studio/renderSharepicToImage';
import { updateCanvasThumbnail } from '../image-studio/services/canvasThumbnailService';
import { uploadBlobToMediaLibrary } from '../image-studio/services/mediaUploadService';

export interface ProfilbildLayout {
  imagePosition: { x: number; y: number };
  imageSize: { w: number; h: number };
}

/**
 * Hand a background-removed photo off to the profile-picture canvas. The
 * transparent PNG is uploaded to a durable media URL (a `data:` URL dies on
 * reload and can't be resolved by collaborators), then a `profilbild` canvas
 * is minted on its pinned square format.
 */
export async function mintProfilbildCanvas(
  transparentDataUrl: string,
  title: string,
  backgroundColor?: string,
  layout?: ProfilbildLayout
): Promise<CanvasDocument> {
  const blob = await (await fetch(transparentDataUrl)).blob();
  const transparentImage = await uploadBlobToMediaLibrary(blob, { uploadSource: 'canvas-mint' });
  if (!transparentImage) throw new Error('Bild konnte nicht hochgeladen werden.');

  const initialState = {
    transparentImage,
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(layout ? { imagePosition: layout.imagePosition, imageSize: layout.imageSize } : {}),
  };
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
    .catch((err: unknown) => console.warn('[profilbildCanvas] thumbnail generation failed:', err));

  return result.body;
}

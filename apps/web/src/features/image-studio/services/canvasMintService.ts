import { getContractsClient } from '@gruenerator/shared/api';

import { getCanvasTypeFields, isMintableCanvasType } from '../utils/canvasTypeFields';

import { updateCanvasThumbnail } from './canvasThumbnailService';
import { uploadBlobToMediaLibrary } from './mediaUploadService';

import type { ImageStudioState } from '../types/storeTypes';

const mintUploadOpts = { uploadSource: 'canvas-mint' } as const;

function pickImageUrl(state: ImageStudioState): string | null {
  if (state.selectedImage?.urls?.regular) return state.selectedImage.urls.regular;
  if (state.generatedImageSrc) return state.generatedImageSrc;
  return null;
}

/** Fetch a `blob:`/`data:` URL into the media library and return its shareable URL. */
async function uploadImageUrlToMediaLibrary(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await uploadBlobToMediaLibrary(blob, mintUploadOpts);
  } catch (err) {
    console.error('[canvasMint] Failed to upload image from URL:', err);
    return null;
  }
}

/**
 * Resolve the persisted image URL for a freshly minted canvas. `upload` types
 * use the uploaded/selected studio image; `transparent` types (profilbild) use
 * the background-removed image, which lives only as a local `blob:`/`data:` URL
 * and must be re-uploaded so collaborators can resolve it.
 */
async function resolveImageUrl(
  state: ImageStudioState,
  source: 'upload' | 'transparent'
): Promise<string | null> {
  if (source === 'transparent') {
    return state.transparentImage ? uploadImageUrlToMediaLibrary(state.transparentImage) : null;
  }
  const picked = pickImageUrl(state);
  if (picked) return picked;
  const blob = state.uploadedImage ?? state.file;
  if (!(blob instanceof Blob)) return null;
  try {
    return await uploadBlobToMediaLibrary(blob, mintUploadOpts);
  } catch (err) {
    console.error('[canvasMint] Failed to upload background image:', err);
    return null;
  }
}

async function buildInitialState(
  state: ImageStudioState,
  type: string
): Promise<Record<string, unknown>> {
  const initial: Record<string, unknown> = {
    colorScheme: state.colorScheme,
    fontSize: state.fontSize,
  };

  const config = getCanvasTypeFields(type);
  if (!config) return initial;

  for (const field of config.fields) {
    initial[field] = state[field] ?? '';
  }

  if (config.image) {
    const imageUrl = await resolveImageUrl(state, config.image.source);
    if (imageUrl) {
      initial[config.image.key] = imageUrl;
    } else if (config.image.required) {
      // Fail loudly rather than mint a broken, imageless canvas — the caller
      // surfaces this as a retry prompt (see TemplateStudioFlow).
      throw new Error(`Cannot mint canvas: required image for "${type}" could not be resolved`);
    }
  }

  return initial;
}

export async function mintCanvasFromStudioStore(state: ImageStudioState): Promise<{ id: string }> {
  // Last-resort assertion. The upstream boundaries (chat SSE validation, the
  // handoff guard, and the validating `setType`) should already guarantee a
  // mintable type reaches here — but keep the check so a regression fails
  // loudly and locally instead of creating a broken canvas.
  if (!state.type || !isMintableCanvasType(state.type)) {
    throw new Error(
      `Cannot mint canvas: "${state.type ?? 'none'}" is not a mintable template type`
    );
  }

  const initial_state = await buildInitialState(state, state.type);
  const title = state.editTitle || 'Neuer Canvas';
  const format = state.selectedFormatId || 'post-portrait';

  const result = await getContractsClient().canvas.create({
    body: {
      title,
      template_type: state.type,
      initial_state,
      format,
      page_count: 1,
    },
  });
  if (result.status !== 201) {
    throw new Error(`Failed to create canvas (HTTP ${result.status})`);
  }

  // Fire-and-forget: renderSharepicToImage mounts its own offscreen root on
  // document.body, so the SPA navigation to the editor doesn't cancel it and
  // mint latency stays unchanged. Without this the /studio gallery card has no
  // preview until the first export.
  const canvasId = result.body.id;
  const mintedType = state.type;
  void import('../renderSharepicToImage')
    .then(({ renderSharepicToImage }) => renderSharepicToImage(mintedType, initial_state))
    .then((dataUrl) => (dataUrl ? updateCanvasThumbnail(canvasId, dataUrl) : undefined))
    .catch((err) => console.warn('[canvasMint] thumbnail generation failed:', err));

  return { id: canvasId };
}

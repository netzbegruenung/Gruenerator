import { getContractsClient } from '@gruenerator/shared/api';

import apiClient from '../../../components/utils/apiClient';
import { getCanvasTypeFields } from '../utils/canvasTypeFields';

import type { ImageStudioState } from '../types/storeTypes';

interface MediaUploadResponse {
  success: boolean;
  data: {
    id: string;
    shareToken: string;
    shareUrl: string;
    mediaType: string;
    createdAt: string;
  };
}

async function uploadBlobToMediaLibrary(blob: Blob): Promise<string | null> {
  const form = new FormData();
  const filename = blob instanceof File && blob.name ? blob.name : `canvas-mint-${Date.now()}.png`;
  form.append('file', blob, filename);
  form.append('uploadSource', 'canvas-mint');

  const res = await apiClient.post<MediaUploadResponse>('/media/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data?.data?.shareUrl ?? null;
}

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
    return await uploadBlobToMediaLibrary(blob);
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
    return await uploadBlobToMediaLibrary(blob);
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
  if (!state.type) {
    throw new Error('Cannot mint canvas: no template type selected');
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

  return { id: result.body.id };
}

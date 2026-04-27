import apiClient from '../../../components/utils/apiClient';

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

interface CanvasCreateResponse {
  id: string;
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

function buildInitialState(
  state: ImageStudioState,
  type: string,
  imageUrl: string | null
): Record<string, unknown> {
  const shared = {
    colorScheme: state.colorScheme,
    fontSize: state.fontSize,
  };
  switch (type) {
    case 'dreizeilen':
      return {
        ...shared,
        line1: state.line1,
        line2: state.line2,
        line3: state.line3,
        ...(imageUrl ? { currentImageSrc: imageUrl } : {}),
      };
    case 'zitat':
      return {
        ...shared,
        quote: state.quote,
        name: state.name,
        ...(imageUrl ? { imageSrc: imageUrl } : {}),
      };
    case 'zitat-pure':
      return {
        ...shared,
        quote: state.quote,
        name: state.name,
      };
    case 'info':
      return {
        ...shared,
        header: state.header,
        body: state.body,
      };
    case 'simple':
      return {
        ...shared,
        headline: state.headline,
        subtext: state.subtext,
        ...(imageUrl ? { imageSrc: imageUrl } : {}),
      };
    case 'veranstaltung':
      return {
        ...shared,
        eventTitle: state.eventTitle,
        beschreibung: state.beschreibung,
        weekday: state.weekday,
        date: state.date,
        time: state.time,
        locationName: state.locationName,
        address: state.address,
        ...(imageUrl ? { imageSrc: imageUrl } : {}),
      };
    case 'slider':
      return {
        ...shared,
        label: state.label,
        headline: state.headline,
        subtext: state.subtext,
      };
    default:
      return { ...shared };
  }
}

export async function mintCanvasFromStudioStore(state: ImageStudioState): Promise<{ id: string }> {
  if (!state.type) {
    throw new Error('Cannot mint canvas: no template type selected');
  }

  let imageUrl = pickImageUrl(state);
  const blob = state.uploadedImage ?? state.file;
  if (!imageUrl && blob instanceof Blob) {
    try {
      imageUrl = await uploadBlobToMediaLibrary(blob);
    } catch (err) {
      console.error('[canvasMint] Failed to upload background image:', err);
    }
  }

  const initial_state = buildInitialState(state, state.type, imageUrl);
  const title = state.editTitle || 'Neuer Canvas';
  const format = state.selectedFormatId || 'post-portrait';

  const res = await apiClient.post<CanvasCreateResponse>('/canvas', {
    title,
    template_type: state.type,
    initial_state,
    format,
    page_count: 1,
  });

  return { id: res.data.id };
}

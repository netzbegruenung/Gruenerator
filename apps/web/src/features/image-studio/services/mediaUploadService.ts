import apiClient from '../../../components/utils/apiClient';

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

/**
 * Upload an image blob to the media library and return a durable, loadable
 * IMAGE url for the canvas.
 *
 * Shared by canvas minting and the in-editor image pickers so that every image
 * a canvas persists resolves to a URL that survives reloads and collaborators —
 * never a session-local `blob:` object URL (which dies on the next page load).
 *
 * NB: returns `/api/share/<token>/download` (the raw image bytes), NOT the
 * upload response's `shareUrl` — that is the human-facing share *page* (HTML),
 * which a canvas background can't render. This matches how the rest of the
 * canvas editor resolves a media item to an image (ImageBackgroundSection,
 * UploadsSection, mediaItemToFile).
 */
export async function uploadBlobToMediaLibrary(
  blob: Blob,
  opts?: { filename?: string; uploadSource?: string }
): Promise<string | null> {
  const form = new FormData();
  const filename =
    opts?.filename ??
    (blob instanceof File && blob.name ? blob.name : `canvas-image-${Date.now()}.png`);
  form.append('file', blob, filename);
  form.append('uploadSource', opts?.uploadSource ?? 'canvas-editor');

  const res = await apiClient.post<MediaUploadResponse>('/media/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const shareToken = res.data?.data?.shareToken;
  return shareToken ? `/api/share/${shareToken}/download` : null;
}

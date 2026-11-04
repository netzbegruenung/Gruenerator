import { uploadToMediaShare } from '../../../services/mediaUpload';

/** Uploads a gallery image (sticker PNG, background JPEG) to the media store; returns its share token. */
export async function uploadStudioAssetImage(
  uri: string,
  filename: string,
  contentType = 'image/png'
): Promise<string> {
  const token = await uploadToMediaShare(uri, filename, contentType, 'studio-asset');
  if (!token) throw new Error('upload failed');
  return token;
}

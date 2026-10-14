import { uploadToMediaShare } from '../../../services/mediaUpload';

/** Uploads a sticker PNG to the media store and returns its share token. */
export async function uploadStickerPng(uri: string, filename: string): Promise<string> {
  const token = await uploadToMediaShare(uri, filename, 'image/png', 'studio-asset');
  if (!token) throw new Error('upload failed');
  return token;
}

export const MEDIA_ACCEPT: Record<string, string[]> = {
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-m4a': ['.m4a'],
  'audio/aac': ['.aac'],
  'audio/ogg': ['.ogg'],
  'audio/webm': ['.webm'],
  'audio/flac': ['.flac'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/x-matroska': ['.mkv'],
  'video/webm': ['.webm'],
};

const VIDEO_TYPE_BY_EXTENSION = new Map(
  Object.entries(MEDIA_ACCEPT)
    .filter(([mime]) => mime.startsWith('video/'))
    .flatMap(([mime, exts]) => exts.map((ext) => [ext.slice(1), mime] as const))
);

/**
 * Browsers leave `File.type` empty for containers they don't know — `.mkv` on
 * macOS and Windows among them. Such a video was treated as audio and hit the
 * audio size limit, so fall back to the extension. An extension shared with
 * audio (`.webm`) resolves to video, which is safe: the server extracts the
 * audio track either way.
 */
export function uploadMediaType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_TYPE_BY_EXTENSION.get(ext) ?? '';
}

export function isVideoUpload(file: File): boolean {
  return uploadMediaType(file).startsWith('video/');
}

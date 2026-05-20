import type { MediaItem } from '@gruenerator/shared/media-library';

export function buildMediaItemUrl(item: MediaItem): string | null {
  if (item.mediaUrl) return item.mediaUrl;
  if (item.shareToken) return `/api/share/${item.shareToken}/download`;
  return item.thumbnailUrl;
}

export async function mediaItemToFile(item: MediaItem): Promise<File> {
  const url = buildMediaItemUrl(item);
  if (!url) throw new Error('Bild hat keine ladbare URL');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Bild konnte nicht geladen werden');
  const blob = await response.blob();
  const filename = item.originalFilename ?? item.title ?? `upload-${item.id}`;
  return new File([blob], filename, { type: blob.type || 'image/jpeg' });
}

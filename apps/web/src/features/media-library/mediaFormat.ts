import { isKiImage, type MediaItem } from '@gruenerator/shared/media-library';

export function formatMediaDate(dateString: string, now = new Date()): string {
  const date = new Date(dateString);
  const days = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Heute';
  if (days === 1) return 'Gestern';
  if (days < 7) return `vor ${days} Tagen`;
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Badge text: what kind of item, with KI-Bild and Sharepic told apart from plain images. */
export function mediaKindLabel(item: MediaItem): string {
  if (item.mediaType === 'video') return 'Video';
  if (item.mediaType === 'audio') return 'Audio';
  if (isKiImage(item)) return 'KI-Bild';
  if (item.contentOrigin === 'sharepic') return 'Sharepic';
  return 'Bild';
}

export function mediaTitle(item: MediaItem): string {
  return item.title || item.originalFilename || 'Unbenannt';
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
};

/** A safe download filename; keeps the original name when there is one. */
export function downloadFilename(item: MediaItem): string {
  if (item.originalFilename) return item.originalFilename;
  const base = (item.title || 'medium').replace(/[^\p{L}\p{N}_.-]+/gu, '_');
  const ext = EXTENSIONS[item.mimeType] ?? item.mimeType.split('/')[1] ?? 'bin';
  return `${base}.${ext}`;
}

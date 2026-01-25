/**
 * Media Library constants
 */

export const MEDIA_ENDPOINTS = {
  LIST: '/media',
  SINGLE: (id: string) => `/media/${id}`,
  UPLOAD: '/media/upload',
  UPDATE: (id: string) => `/media/${id}`,
  DELETE: (id: string) => `/media/${id}`,
  SEARCH: '/media/search',
} as const;

export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const SUPPORTED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

export const SUPPORTED_MIME_TYPES = [...SUPPORTED_IMAGE_TYPES, ...SUPPORTED_VIDEO_TYPES] as const;

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const DEFAULT_PAGINATION = {
  limit: 50,
  offset: 0,
} as const;

export const MEDIA_LIMITS = {
  maxItemsPerUser: 50,
  maxFileSize: MAX_FILE_SIZE,
  maxTitleLength: 200,
  maxAltTextLength: 500,
} as const;

export const UPLOAD_SOURCE_LABELS: Record<string, string> = {
  upload: 'Hochgeladen',
  ai_generated: 'KI-generiert',
  stock: 'Stockbild',
  camera: 'Kamera',
};

export const MEDIA_TYPE_LABELS: Record<string, string> = {
  image: 'Bild',
  video: 'Video',
  all: 'Alle',
};

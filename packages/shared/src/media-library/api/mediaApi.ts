/**
 * Media Library API functions
 * Platform-agnostic API calls using the global API client
 */

import { getGlobalApiClient } from '../../api/client.js';
import { MEDIA_ENDPOINTS } from '../constants.js';
import type {
  MediaFilters,
  MediaListResponse,
  MediaItemResponse,
  MediaUploadResponse,
  MediaUpdateParams,
  MediaUpdateResponse,
  MediaDeleteResponse,
} from '../types.js';

/**
 * Fetch media library with filters
 */
export async function getMediaLibrary(filters: MediaFilters = {}): Promise<MediaListResponse> {
  const client = getGlobalApiClient();

  const params = new URLSearchParams();
  if (filters.type && filters.type !== 'all') {
    params.append('type', filters.type);
  }
  if (filters.search) {
    params.append('search', filters.search);
  }
  if (filters.limit) {
    params.append('limit', String(filters.limit));
  }
  if (filters.offset) {
    params.append('offset', String(filters.offset));
  }
  if (filters.sort) {
    params.append('sort', filters.sort);
  }

  const queryString = params.toString();
  const url = queryString ? `${MEDIA_ENDPOINTS.LIST}?${queryString}` : MEDIA_ENDPOINTS.LIST;

  const response = await client.get<MediaListResponse>(url);
  return response.data;
}

/**
 * Get single media item by ID
 */
export async function getMediaById(id: string): Promise<MediaItemResponse> {
  const client = getGlobalApiClient();
  const response = await client.get<MediaItemResponse>(MEDIA_ENDPOINTS.SINGLE(id));
  return response.data;
}

/**
 * Upload media file
 * Note: For web, pass a File object. For mobile, pass a Blob with the file data.
 */
export async function uploadMedia(
  file: File | Blob,
  options: {
    title?: string;
    altText?: string;
    uploadSource?: string;
    onProgress?: (progress: number) => void;
  } = {}
): Promise<MediaUploadResponse> {
  const client = getGlobalApiClient();

  const formData = new FormData();
  formData.append('file', file);

  if (options.title) {
    formData.append('title', options.title);
  }
  if (options.altText) {
    formData.append('altText', options.altText);
  }
  if (options.uploadSource) {
    formData.append('uploadSource', options.uploadSource);
  }

  const response = await client.post<MediaUploadResponse>(MEDIA_ENDPOINTS.UPLOAD, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: options.onProgress
      ? (progressEvent) => {
          const total = progressEvent.total || 1;
          const progress = Math.round((progressEvent.loaded * 100) / total);
          options.onProgress!(progress);
        }
      : undefined,
  });

  return response.data;
}

/**
 * Update media metadata
 */
export async function updateMedia(
  id: string,
  params: MediaUpdateParams
): Promise<MediaUpdateResponse> {
  const client = getGlobalApiClient();
  const response = await client.put<MediaUpdateResponse>(MEDIA_ENDPOINTS.UPDATE(id), params);
  return response.data;
}

/**
 * Delete media item
 */
export async function deleteMedia(id: string): Promise<MediaDeleteResponse> {
  const client = getGlobalApiClient();
  const response = await client.delete<MediaDeleteResponse>(MEDIA_ENDPOINTS.DELETE(id));
  return response.data;
}

/**
 * Search media by query
 */
export async function searchMedia(
  query: string,
  options: { type?: 'image' | 'video' | 'all'; limit?: number } = {}
): Promise<MediaListResponse> {
  const client = getGlobalApiClient();

  const params = new URLSearchParams();
  params.append('q', query);
  if (options.type && options.type !== 'all') {
    params.append('type', options.type);
  }
  if (options.limit) {
    params.append('limit', String(options.limit));
  }

  const response = await client.get<MediaListResponse>(`${MEDIA_ENDPOINTS.SEARCH}?${params}`);
  return response.data;
}

export const mediaApi = {
  getMediaLibrary,
  getMediaById,
  uploadMedia,
  updateMedia,
  deleteMedia,
  searchMedia,
};

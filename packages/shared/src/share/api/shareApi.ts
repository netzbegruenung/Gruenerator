/**
 * Share API client
 * HTTP methods for share CRUD operations
 */

import { apiRequest } from '../../api/client.js';
import type {
  Share,
  ShareResponse,
  ShareListResponse,
  DeleteShareResponse,
  SaveAsTemplateResponse,
  CreateVideoShareParams,
  CreateImageShareParams,
  UpdateImageShareParams,
  ShareMediaType,
} from '../types.js';

/**
 * API endpoints for sharing
 */
export const SHARE_ENDPOINTS = {
  CREATE_IMAGE: '/share/image',
  CREATE_VIDEO: '/share/video',
  CREATE_VIDEO_FROM_PROJECT: '/share/video/from-project',
  USER_SHARES: '/share/my',
  SHARE_INFO: (token: string) => `/share/${token}`,
  SHARE_THUMBNAIL: (token: string) => `/share/${token}/thumbnail`,
  SHARE_PREVIEW: (token: string) => `/share/${token}/preview`,
  SHARE_DOWNLOAD: (token: string) => `/share/${token}/download`,
  UPDATE_IMAGE: (token: string) => `/share/${token}/image`,
  DELETE_SHARE: (token: string) => `/share/${token}`,
  SAVE_AS_TEMPLATE: (token: string) => `/share/${token}/save-as-template`,
} as const;

/**
 * Create a video share from a project
 */
export async function createVideoShare(
  params: CreateVideoShareParams
): Promise<ShareResponse> {
  return apiRequest<ShareResponse>('post', SHARE_ENDPOINTS.CREATE_VIDEO_FROM_PROJECT, params);
}

/**
 * Create a video share from an export token
 */
export async function createVideoShareFromToken(
  exportToken: string,
  title?: string,
  projectId?: string
): Promise<ShareResponse> {
  return apiRequest<ShareResponse>('post', SHARE_ENDPOINTS.CREATE_VIDEO, {
    exportToken,
    title,
    projectId,
  });
}

/**
 * Create an image share
 */
export async function createImageShare(
  params: CreateImageShareParams
): Promise<ShareResponse> {
  return apiRequest<ShareResponse>('post', SHARE_ENDPOINTS.CREATE_IMAGE, params);
}

/**
 * Update an existing image share
 */
export async function updateImageShare(
  params: UpdateImageShareParams
): Promise<ShareResponse> {
  const { shareToken, ...data } = params;
  return apiRequest<ShareResponse>('put', SHARE_ENDPOINTS.UPDATE_IMAGE(shareToken), data);
}

/**
 * Get user's shares (optionally filtered by media type)
 */
export async function getUserShares(
  mediaType?: ShareMediaType
): Promise<ShareListResponse> {
  const url = mediaType
    ? `${SHARE_ENDPOINTS.USER_SHARES}?type=${mediaType}`
    : SHARE_ENDPOINTS.USER_SHARES;
  return apiRequest<ShareListResponse>('get', url);
}

/**
 * Get share info by token (public endpoint)
 */
export async function getShareInfo(shareToken: string): Promise<ShareResponse> {
  return apiRequest<ShareResponse>('get', SHARE_ENDPOINTS.SHARE_INFO(shareToken));
}

/**
 * Delete a share
 */
export async function deleteShare(shareToken: string): Promise<DeleteShareResponse> {
  return apiRequest<DeleteShareResponse>('delete', SHARE_ENDPOINTS.DELETE_SHARE(shareToken));
}

/**
 * Save a share as a public template
 */
export async function saveAsTemplate(
  shareToken: string,
  title: string,
  visibility: 'private' | 'unlisted' | 'public' = 'private'
): Promise<SaveAsTemplateResponse> {
  return apiRequest<SaveAsTemplateResponse>('post', SHARE_ENDPOINTS.SAVE_AS_TEMPLATE(shareToken), {
    title,
    visibility
  });
}

/**
 * Share API object for convenient access
 */
export const shareApi = {
  createVideoShare,
  createVideoShareFromToken,
  createImageShare,
  updateImageShare,
  getUserShares,
  getShareInfo,
  deleteShare,
  saveAsTemplate,
  endpoints: SHARE_ENDPOINTS,
};

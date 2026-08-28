/**
 * Shared service access for the /api/share routers.
 *
 * Lazy-loads SharedMediaService (a heavy module pulled in on first use).
 * Consumed by the file router, the read contract router, the workplace
 * activity feed and the canvas repository.
 */

import type { ReapedShare } from '../../services/sharedMediaService.js';
import type { SharedMediaRow, ShareResult } from '../../types/media.js';

export interface CreateImageShareParams {
  imageBase64: string;
  title: string;
  imageType: string | null;
  metadata: Record<string, unknown>;
  originalImage: string | null;
  status?: 'ready' | 'draft';
}

export interface CreateVideoShareParams {
  videoPath: string;
  title: string;
  thumbnailPath: string | null;
  duration: number | null;
  projectId: string | null;
}

export interface CreatePendingVideoShareParams {
  title: string;
  thumbnailPath: string | null;
  duration: number | null;
  projectId: string;
}

export interface UpdateImageShareParams {
  imageBase64: string;
  title?: string;
  metadata: Record<string, unknown>;
  originalImage?: string | null;
}

export interface SharedMediaService {
  ensureInitialized(): Promise<void>;
  createImageShare(userId: string, params: CreateImageShareParams): Promise<ShareResult>;
  createVideoShare(userId: string, params: CreateVideoShareParams): Promise<ShareResult>;
  createPendingVideoShare(
    userId: string,
    params: CreatePendingVideoShareParams
  ): Promise<ShareResult>;
  getUserShares(
    userId: string,
    type: string | null,
    status?: string | readonly string[] | null,
    limit?: number
  ): Promise<SharedMediaRow[]>;
  getLibraryUsage(userId: string): Promise<{
    count: number;
    limit: number;
    isFull: boolean;
    isNearlyFull: boolean;
  }>;
  getShareByToken(shareToken: string): Promise<SharedMediaRow | null>;
  recordView(shareToken: string): Promise<void>;
  recordDownload(
    shareToken: string,
    email: string | null,
    ip: string,
    shareId?: string
  ): Promise<void>;
  deleteShare(userId: string, shareToken: string): Promise<void>;
  renameShare(userId: string, shareToken: string, title: string): Promise<boolean>;
  finalizeVideoShare(shareToken: string, videoPath: string): Promise<void>;
  markShareFailed(shareToken: string): Promise<void>;
  /** Rows and files for shares stuck in processing/failed. Called by the
   * uploads cleaner, not by a route — nothing user-facing can reach them. */
  reapOrphanedShares(olderThanHours: number): Promise<ReapedShare[]>;
  updateImageShare(
    userId: string,
    shareToken: string,
    params: UpdateImageShareParams
  ): Promise<ShareResult>;
  // These return null for a missing path and for anything resolving outside the
  // uploads root — the traversal guard's whole point. The interface used to
  // declare them as returning `string`, which let callers hand the result
  // straight to `fs` and turned a rejected path into a crash instead of a 404.
  getThumbnailFilePath(relativePath: string | null): string | null;
  getMediaFilePath(relativePath: string | null): string | null;
  getOriginalImagePath(shareToken: string, filename: string): string | null;
  clearOriginalImageMetadata(shareToken: string): Promise<void>;
  markAsTemplate(
    userId: string,
    shareToken: string,
    title: string,
    visibility: string,
    userName: string
  ): Promise<void>;
  cloneTemplate(templateToken: string, userId: string, userName: string): Promise<ShareResult>;
  getTemplates(userId: string | null, visibility: string): Promise<SharedMediaRow[]>;
  getTemplateByToken(
    templateToken: string,
    requestingUserId?: string
  ): Promise<SharedMediaRow | null>;
}

// Lazy-loaded service
let sharedMediaService: SharedMediaService | null = null;

export async function getSharedMediaService(): Promise<SharedMediaService> {
  if (!sharedMediaService) {
    const { getSharedMediaService: getService } =
      await import('../../services/sharedMediaService.js');
    sharedMediaService = getService() as unknown as SharedMediaService;
    await sharedMediaService.ensureInitialized();
  }
  return sharedMediaService;
}

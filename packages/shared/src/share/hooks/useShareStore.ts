/**
 * Share store - Zustand store for share state management
 * Migrated from apps/web/src/stores/mediaShareStore.js
 */

import { create } from 'zustand';
import type {
  Share,
  ShareStoreState,
  ShareStoreActions,
  CreateVideoShareParams,
  CreateImageShareParams,
  UpdateImageShareParams,
  ShareMediaType,
  SaveAsTemplateResponse,
} from '../types.js';
import { shareApi } from '../api/shareApi.js';

const initialState: ShareStoreState = {
  shares: [],
  currentShare: null,
  isLoading: false,
  isCreating: false,
  error: null,
  errorCode: null,
  count: 0,
  limit: 50,
};

/**
 * Share store hook
 * Manages share state and API operations
 */
export const useShareStore = create<ShareStoreState & ShareStoreActions>((set, get) => ({
  ...initialState,

  /**
   * Create a video share from a project
   */
  createVideoShare: async (params: CreateVideoShareParams): Promise<Share> => {
    set({ isCreating: true, error: null, errorCode: null });

    try {
      const response = await shareApi.createVideoShare(params);

      if (response.success && response.share) {
        const newShare = response.share;
        set((state) => ({
          isCreating: false,
          currentShare: newShare,
          shares: [newShare, ...state.shares],
          count: state.count + 1,
        }));
        return newShare;
      } else {
        throw new Error(response.error || 'Failed to create video share');
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error, 'Failed to create video share');
      const errorCode = extractErrorCode(error);
      set({ isCreating: false, error: errorMessage, errorCode });
      throw new Error(errorMessage);
    }
  },

  /**
   * Create a video share from an export token
   */
  createVideoShareFromToken: async (
    exportToken: string,
    title?: string,
    projectId?: string
  ): Promise<Share> => {
    set({ isCreating: true, error: null, errorCode: null });

    try {
      const response = await shareApi.createVideoShareFromToken(exportToken, title, projectId);

      if (response.success && response.share) {
        const newShare = response.share;
        set((state) => ({
          isCreating: false,
          currentShare: newShare,
          shares: [newShare, ...state.shares],
          count: state.count + 1,
        }));
        return newShare;
      } else {
        throw new Error(response.error || 'Failed to create video share');
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error, 'Failed to create video share');
      const errorCode = extractErrorCode(error);
      set({ isCreating: false, error: errorMessage, errorCode });
      throw new Error(errorMessage);
    }
  },

  /**
   * Create an image share
   */
  createImageShare: async (params: CreateImageShareParams): Promise<Share> => {
    set({ isCreating: true, error: null, errorCode: null });

    try {
      const response = await shareApi.createImageShare(params);

      if (response.success && response.share) {
        const newShare = response.share;
        set((state) => ({
          isCreating: false,
          currentShare: newShare,
          shares: [newShare, ...state.shares],
          count: state.count + 1,
        }));
        return newShare;
      } else {
        throw new Error(response.error || 'Failed to create image share');
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error, 'Failed to create image share');
      set({ isCreating: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  /**
   * Update an existing image share
   */
  updateImageShare: async (params: UpdateImageShareParams): Promise<Share> => {
    set({ isCreating: true, error: null, errorCode: null });

    try {
      const response = await shareApi.updateImageShare(params);

      if (response.success && response.share) {
        const updatedShare = response.share;
        set((state) => ({
          isCreating: false,
          currentShare: updatedShare,
          shares: state.shares.map((s) =>
            s.shareToken === params.shareToken ? { ...s, ...updatedShare } : s
          ),
        }));
        return updatedShare;
      } else {
        throw new Error(response.error || 'Failed to update image share');
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error, 'Failed to update image share');
      set({ isCreating: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  /**
   * Fetch user's shares (optionally filtered by media type)
   */
  fetchUserShares: async (mediaType?: ShareMediaType): Promise<Share[]> => {
    set({ isLoading: true, error: null });

    try {
      const response = await shareApi.getUserShares(mediaType);

      if (response.success) {
        set({
          isLoading: false,
          shares: response.shares,
          count: response.count || response.shares.length,
          limit: response.limit || 50,
        });
        return response.shares;
      } else {
        throw new Error(response.error || 'Failed to fetch shares');
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error, 'Failed to fetch shares');
      set({ isLoading: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  /**
   * Fetch only image shares
   */
  fetchImageShares: async (): Promise<Share[]> => {
    return get().fetchUserShares('image');
  },

  /**
   * Fetch only video shares
   */
  fetchVideoShares: async (): Promise<Share[]> => {
    return get().fetchUserShares('video');
  },

  /**
   * Delete a share
   */
  deleteShare: async (shareToken: string): Promise<boolean> => {
    try {
      const response = await shareApi.deleteShare(shareToken);

      if (response.success) {
        set((state) => ({
          shares: state.shares.filter((s) => s.shareToken !== shareToken),
          currentShare: state.currentShare?.shareToken === shareToken ? null : state.currentShare,
          count: Math.max(0, state.count - 1),
        }));
        return true;
      } else {
        throw new Error(response.error || 'Failed to delete share');
      }
    } catch (error) {
      const errorMessage = extractErrorMessage(error, 'Failed to delete share');
      set({ error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  /**
   * Save a share as a template
   */
  saveAsTemplate: async (
    shareToken: string,
    title: string,
    visibility: 'private' | 'unlisted' | 'public'
  ): Promise<SaveAsTemplateResponse> => {
    set({ isLoading: true, error: null, errorCode: null });
    try {
      const result = await shareApi.saveAsTemplate(shareToken, title, visibility);
      set({ isLoading: false });
      return result;
    } catch (error) {
      const errorMessage = extractErrorMessage(error, 'Failed to save as template');
      set({ isLoading: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  /**
   * Clear the current share
   */
  clearCurrentShare: () => {
    set({ currentShare: null });
  },

  /**
   * Clear any error state
   */
  clearError: () => {
    set({ error: null, errorCode: null });
  },

  /**
   * Reset the store to initial state
   */
  reset: () => {
    set(initialState);
  },
}));

/**
 * Extract error message from various error types
 */
function extractErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    // Axios error
    if ('response' in error && error.response && typeof error.response === 'object') {
      const response = error.response as { data?: { error?: string } };
      if (response.data?.error) {
        return response.data.error;
      }
    }
    // Standard Error
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }
  }
  return fallback;
}

/**
 * Extract error code from axios error
 */
function extractErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { code?: string } } }).response;
    return response?.data?.code || null;
  }
  return null;
}

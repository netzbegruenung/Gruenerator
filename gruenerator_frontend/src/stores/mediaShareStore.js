import { create } from 'zustand';
import apiClient from '../components/utils/apiClient';

const initialState = {
  shares: [],
  isLoading: false,
  error: null,
  errorCode: null,
  currentShare: null,
  isCreating: false,
  count: 0,
  limit: 50,
};

export const useMediaShareStore = create((set, get) => ({
  ...initialState,

  createVideoShare: async (projectId, title = null) => {
    set({ isCreating: true, error: null, errorCode: null });

    try {
      const response = await apiClient.post('/share/video/from-project', {
        projectId,
        title,
      });

      if (response.data.success) {
        const newShare = response.data.share;
        set((state) => ({
          isCreating: false,
          currentShare: newShare,
          shares: [newShare, ...state.shares],
          count: state.count + 1,
        }));
        return newShare;
      } else {
        throw new Error(response.data.error || 'Failed to create video share');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to create video share';
      const errorCode = error.response?.data?.code || null;
      set({ isCreating: false, error: errorMessage, errorCode });
      throw new Error(errorMessage);
    }
  },

  createVideoShareFromToken: async (exportToken, title = null, projectId = null) => {
    set({ isCreating: true, error: null, errorCode: null });

    try {
      const response = await apiClient.post('/share/video', {
        exportToken,
        title,
        projectId,
      });

      if (response.data.success) {
        const newShare = response.data.share;
        set((state) => ({
          isCreating: false,
          currentShare: newShare,
          shares: [newShare, ...state.shares],
          count: state.count + 1,
        }));
        return newShare;
      } else {
        throw new Error(response.data.error || 'Failed to create video share');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to create video share';
      const errorCode = error.response?.data?.code || null;
      set({ isCreating: false, error: errorMessage, errorCode });
      throw new Error(errorMessage);
    }
  },

  createImageShare: async (imageData, title = null, imageType = null, metadata = {}, originalImage = null) => {
    set({ isCreating: true, error: null, errorCode: null });

    try {
      const response = await apiClient.post('/share/image', {
        imageData,
        title,
        imageType,
        metadata,
        originalImage,
      });

      if (response.data.success) {
        const newShare = response.data.share;
        set((state) => ({
          isCreating: false,
          currentShare: newShare,
          shares: [newShare, ...state.shares],
          count: state.count + 1,
        }));
        return newShare;
      } else {
        throw new Error(response.data.error || 'Failed to create image share');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to create image share';
      set({ isCreating: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  updateImageShare: async (shareToken, imageData, title = null, metadata = {}, originalImage = null) => {
    set({ isCreating: true, error: null, errorCode: null });

    try {
      const response = await apiClient.put(`/share/${shareToken}/image`, {
        imageBase64: imageData,
        title,
        metadata,
        originalImage,
      });

      if (response.data.success) {
        const updatedShare = response.data.share;
        set((state) => ({
          isCreating: false,
          currentShare: updatedShare,
          shares: state.shares.map((s) =>
            s.shareToken === shareToken ? { ...s, ...updatedShare } : s
          ),
        }));
        return updatedShare;
      } else {
        throw new Error(response.data.error || 'Failed to update image share');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to update image share';
      set({ isCreating: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  fetchUserShares: async (mediaType = null) => {
    set({ isLoading: true, error: null });

    try {
      const url = mediaType ? `/share/my?type=${mediaType}` : '/share/my';
      const response = await apiClient.get(url);

      if (response.data.success) {
        set({
          isLoading: false,
          shares: response.data.shares,
          count: response.data.count || response.data.shares.length,
          limit: response.data.limit || 50,
        });
        return response.data.shares;
      } else {
        throw new Error(response.data.error || 'Failed to fetch shares');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to fetch shares';
      set({ isLoading: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  fetchImageShares: async () => {
    return get().fetchUserShares('image');
  },

  fetchVideoShares: async () => {
    return get().fetchUserShares('video');
  },

  deleteShare: async (shareToken) => {
    try {
      const response = await apiClient.delete(`/share/${shareToken}`);

      if (response.data.success) {
        set((state) => ({
          shares: state.shares.filter((s) => s.shareToken !== shareToken),
          currentShare: state.currentShare?.shareToken === shareToken ? null : state.currentShare,
          count: Math.max(0, state.count - 1),
        }));
        return true;
      } else {
        throw new Error(response.data.error || 'Failed to delete share');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to delete share';
      set({ error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  clearCurrentShare: () => {
    set({ currentShare: null });
  },

  clearError: () => {
    set({ error: null, errorCode: null });
  },

  reset: () => {
    set(initialState);
  },
}));

export const getShareUrl = (shareToken) => {
  return `${window.location.origin}/share/${shareToken}`;
};

export default useMediaShareStore;

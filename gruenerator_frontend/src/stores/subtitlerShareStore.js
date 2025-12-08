import { create } from 'zustand';
import apiClient from '../components/utils/apiClient';

const initialState = {
  shares: [],
  isLoading: false,
  error: null,
  errorCode: null,
  currentShare: null,
  isCreatingShare: false,
};

export const useSubtitlerShareStore = create((set, get) => ({
  ...initialState,

  createShareFromProject: async (projectId, title = null, expiresInDays = 7) => {
    set({ isCreatingShare: true, error: null, errorCode: null });

    try {
      const response = await apiClient.post('/subtitler/share/from-project', {
        projectId,
        title,
        expiresInDays,
      });

      if (response.data.success) {
        const newShare = response.data.share;
        set((state) => ({
          isCreatingShare: false,
          currentShare: newShare,
          shares: [newShare, ...state.shares],
        }));
        return newShare;
      } else {
        throw new Error(response.data.error || 'Failed to create share');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to create share';
      const errorCode = error.response?.data?.code || null;
      set({ isCreatingShare: false, error: errorMessage, errorCode });
      throw new Error(errorMessage);
    }
  },

  fetchUserShares: async () => {
    set({ isLoading: true, error: null });

    try {
      const response = await apiClient.get('/subtitler/share/my');

      if (response.data.success) {
        set({
          isLoading: false,
          shares: response.data.shares,
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

  deleteShare: async (shareToken) => {
    try {
      const response = await apiClient.delete(`/subtitler/share/${shareToken}`);

      if (response.data.success) {
        set((state) => ({
          shares: state.shares.filter((s) => s.share_token !== shareToken),
          currentShare: state.currentShare?.shareToken === shareToken ? null : state.currentShare,
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
  return `${window.location.origin}/subtitler/share/${shareToken}`;
};

export default useSubtitlerShareStore;

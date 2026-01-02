import { create } from 'zustand';
import apiClient from '../components/utils/apiClient';

interface Share {
  share_token: string;
  shareToken?: string;
  title?: string;
  [key: string]: unknown;
}

interface SubtitlerShareState {
  shares: Share[];
  isLoading: boolean;
  error: string | null;
  errorCode: string | null;
  currentShare: Share | null;
  isCreatingShare: boolean;
  createShareFromProject: (projectId: string, title?: string | null, expiresInDays?: number) => Promise<Share>;
  fetchUserShares: () => Promise<Share[]>;
  deleteShare: (shareToken: string) => Promise<boolean>;
  clearCurrentShare: () => void;
  clearError: () => void;
  reset: () => void;
}

const initialState = {
  shares: [] as Share[],
  isLoading: false,
  error: null as string | null,
  errorCode: null as string | null,
  currentShare: null as Share | null,
  isCreatingShare: false,
};

export const useSubtitlerShareStore = create<SubtitlerShareState>((set, get) => ({
  ...initialState,

  createShareFromProject: async (projectId: string, title: string | null = null, expiresInDays = 7) => {
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
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; code?: string } }; message?: string };
      const errorMessage = err.response?.data?.error || err.message || 'Failed to create share';
      const errorCode = err.response?.data?.code || null;
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
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage = err.response?.data?.error || err.message || 'Failed to fetch shares';
      set({ isLoading: false, error: errorMessage });
      throw new Error(errorMessage);
    }
  },

  deleteShare: async (shareToken: string) => {
    try {
      const response = await apiClient.delete(`/subtitler/share/${shareToken}`);

      if (response.data.success) {
        set((state) => ({
          shares: state.shares.filter((s: Share) => s.share_token !== shareToken),
          currentShare: state.currentShare?.shareToken === shareToken ? null : state.currentShare,
        }));
        return true;
      } else {
        throw new Error(response.data.error || 'Failed to delete share');
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage = err.response?.data?.error || err.message || 'Failed to delete share';
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

export const getShareUrl = (shareToken: string): string => {
  return `${window.location.origin}/subtitler/share/${shareToken}`;
};

export default useSubtitlerShareStore;

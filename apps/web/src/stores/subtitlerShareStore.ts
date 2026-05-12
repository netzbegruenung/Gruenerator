import { type ApiErrorBody } from '@gruenerator/contracts';
import axios from 'axios';
import { create } from 'zustand';

import apiClient from '../components/utils/apiClient';

// ── API response shapes ────────────────────────────────────────────────

interface CreateShareResponse {
  success: boolean;
  error?: string;
  code?: string;
  share?: Share;
}

interface SharesListResponse {
  success: boolean;
  error?: string;
  shares?: Share[];
}

interface DeleteShareResponse {
  success: boolean;
  error?: string;
}

/**
 * Wire shape for a share record. The backend mixes camelCase
 * (`shareToken`, `shareUrl`) for new payloads and snake_case
 * (`share_token`) for legacy / list rows — both fields are tolerated until
 * the legacy path is migrated.
 */
interface Share {
  share_token: string;
  shareToken?: string;
  shareUrl?: string;
  title?: string;
  duration?: number | null;
  expiresAt?: string;
  expires_at?: string;
  thumbnailUrl?: string | null;
  thumbnail_path?: string | null;
  status?: 'ready' | 'rendering' | 'failed';
}

interface SubtitlerShareState {
  shares: Share[];
  isLoading: boolean;
  error: string | null;
  errorCode: string | null;
  currentShare: Share | null;
  isCreatingShare: boolean;
  createShareFromProject: (
    projectId: string,
    title?: string | null,
    expiresInDays?: number
  ) => Promise<Share>;
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

interface ApiErrorParts {
  message: string;
  code: string | null;
}

function readAxiosError(error: unknown, fallback: string): ApiErrorParts {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return {
      message: error.response?.data?.error ?? error.message ?? fallback,
      code: error.response?.data?.code ?? null,
    };
  }
  return {
    message: error instanceof Error ? error.message : fallback,
    code: null,
  };
}

export const useSubtitlerShareStore = create<SubtitlerShareState>((set, get) => ({
  ...initialState,

  createShareFromProject: async (
    projectId: string,
    title: string | null = null,
    expiresInDays = 7
  ) => {
    set({ isCreatingShare: true, error: null, errorCode: null });

    try {
      const response = await apiClient.post<CreateShareResponse>('/subtitler/share/from-project', {
        projectId,
        title,
        expiresInDays,
      });

      if (response.data.success && response.data.share) {
        const newShare = response.data.share;
        set((state) => ({
          isCreatingShare: false,
          currentShare: newShare,
          shares: [newShare, ...state.shares],
        }));
        return newShare;
      } else {
        throw new Error(response.data.error ?? 'Failed to create share');
      }
    } catch (error: unknown) {
      const { message, code } = readAxiosError(error, 'Failed to create share');
      set({ isCreatingShare: false, error: message, errorCode: code });
      throw new Error(message);
    }
  },

  fetchUserShares: async () => {
    set({ isLoading: true, error: null });

    try {
      const response = await apiClient.get<SharesListResponse>('/subtitler/share/my');

      if (response.data.success) {
        const shares = response.data.shares ?? [];
        set({
          isLoading: false,
          shares,
        });
        return shares;
      } else {
        throw new Error(response.data.error ?? 'Failed to fetch shares');
      }
    } catch (error: unknown) {
      const { message } = readAxiosError(error, 'Failed to fetch shares');
      set({ isLoading: false, error: message });
      throw new Error(message);
    }
  },

  deleteShare: async (shareToken: string) => {
    try {
      const response = await apiClient.delete<DeleteShareResponse>(
        `/subtitler/share/${shareToken}`
      );

      if (response.data.success) {
        set((state) => ({
          shares: state.shares.filter((s: Share) => s.share_token !== shareToken),
          currentShare: state.currentShare?.shareToken === shareToken ? null : state.currentShare,
        }));
        return true;
      } else {
        throw new Error(response.data.error ?? 'Failed to delete share');
      }
    } catch (error: unknown) {
      const { message } = readAxiosError(error, 'Failed to delete share');
      set({ error: message });
      throw new Error(message);
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

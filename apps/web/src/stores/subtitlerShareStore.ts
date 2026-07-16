import { getContractsClient } from '@gruenerator/shared/api';
import { create } from 'zustand';

import { getPublicAppOrigin } from '../utils/platform';

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

export const useSubtitlerShareStore = create<SubtitlerShareState>((set) => ({
  ...initialState,

  createShareFromProject: async (
    projectId: string,
    title: string | null = null,
    expiresInDays = 7
  ) => {
    set({ isCreatingShare: true, error: null, errorCode: null });

    const res = await getContractsClient().subtitler.createShareFromProject({
      body: { projectId, ...(title != null && { title }), expiresInDays },
    });

    if ((res.status === 200 || res.status === 201) && res.body.success && res.body.share) {
      const share = res.body.share;
      const newShare: Share = {
        share_token: share.shareToken,
        shareToken: share.shareToken,
        shareUrl: share.shareUrl,
        expiresAt: typeof share.expiresAt === 'string' ? share.expiresAt : String(share.expiresAt),
        ...(share.status != null && { status: share.status }),
      };
      set((state) => ({
        isCreatingShare: false,
        currentShare: newShare,
        shares: [newShare, ...state.shares],
      }));
      return newShare;
    }

    const body = res.body as { error?: string; code?: string };
    const message = body?.error ?? 'Failed to create share';
    set({ isCreatingShare: false, error: message, errorCode: body?.code ?? null });
    throw new Error(message);
  },

  fetchUserShares: async () => {
    set({ isLoading: true, error: null });

    const res = await getContractsClient().subtitler.listMyShares();

    if (res.status === 200 && res.body.success) {
      const shares = (res.body.shares ?? []) as unknown as Share[];
      set({ isLoading: false, shares });
      return shares;
    }

    const message = (res.body as { error?: string })?.error ?? 'Failed to fetch shares';
    set({ isLoading: false, error: message });
    throw new Error(message);
  },

  deleteShare: async (shareToken: string) => {
    const res = await getContractsClient().subtitler.deleteShare({ params: { shareToken } });

    if (res.status === 200 && res.body.success) {
      set((state) => ({
        shares: state.shares.filter((s: Share) => s.share_token !== shareToken),
        currentShare: state.currentShare?.shareToken === shareToken ? null : state.currentShare,
      }));
      return true;
    }

    const message = (res.body as { error?: string })?.error ?? 'Failed to delete share';
    set({ error: message });
    throw new Error(message);
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
  return `${getPublicAppOrigin()}/subtitler/share/${shareToken}`;
};

export default useSubtitlerShareStore;

import { type SocialPostPayload } from '@gruenerator/contracts';
import { create } from 'zustand';

/**
 * Live state of the EXPERIMENTAL combined social post's TEXT half. Sibling of
 * sharepicLiveStore (which keeps handling the sharepic half unchanged).
 *
 * Written by the SSE parser (`social_post_complete` / `social_post_updated`)
 * and by card-mount rehydration; read by SocialPostCard for in-place text
 * updates and by SharepicArtifactPanel to render the text section when a
 * post is active.
 */
export interface ActiveSocialPost {
  postId: string;
  /** Render seed for surfaces that don't hold the original message payload. */
  post: SocialPostPayload;
}

interface SocialPostLiveStore {
  /** postId → latest head payload. */
  entries: Record<string, SocialPostPayload>;
  activePost: ActiveSocialPost | null;
  upsertEntry: (post: SocialPostPayload) => void;
  setActivePost: (active: ActiveSocialPost | null) => void;
}

export const useSocialPostLiveStore = create<SocialPostLiveStore>((set, get) => ({
  entries: {},
  activePost: null,

  upsertEntry: (post) => {
    const prev = get().entries[post.postId];
    // Mount rehydration must not downgrade a newer live version.
    if (prev && prev.version >= post.version) return;
    set({ entries: { ...get().entries, [post.postId]: post } });
    const active = get().activePost;
    if (active?.postId === post.postId) {
      set({ activePost: { ...active, post } });
    }
  },

  setActivePost: (active) => set({ activePost: active }),
}));

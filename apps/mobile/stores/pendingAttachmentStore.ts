import { type CreateAttachment } from '@assistant-ui/react-native';
import { create } from 'zustand';

/**
 * Attachments picked before a thread exists.
 *
 * A runtime IS in scope on the start screen — `AppDrawer` wraps the whole Stack
 * in an `AssistantRuntimeProvider` — but it is the wrong one: that composer
 * hands its text to a NEW conversation, and the pushed conversation builds its
 * own runtime in `MobileChatProvider`. An attachment added to the drawer's
 * composer would stay behind on a thread the user never opens.
 *
 * So the picked attachment waits here for the length of one navigation and the
 * new thread's composer drains it on mount. Not a second upload path: uploading
 * to the document store would create a permanent, vectorised document, which is
 * a different thing than attaching a file to one message.
 *
 * Deliberately not persisted: an attachment that outlives the navigation would
 * reappear on an unrelated conversation.
 */

interface PendingAttachmentState {
  pending: CreateAttachment[];
  add: (attachment: CreateAttachment) => void;
  /** Returns everything queued and empties the queue in one go. */
  drain: () => CreateAttachment[];
}

export const usePendingAttachmentStore = create<PendingAttachmentState>((set, get) => ({
  pending: [],
  add: (attachment) => set((state) => ({ pending: [...state.pending, attachment] })),
  drain: () => {
    const { pending } = get();
    if (pending.length > 0) set({ pending: [] });
    return pending;
  },
}));

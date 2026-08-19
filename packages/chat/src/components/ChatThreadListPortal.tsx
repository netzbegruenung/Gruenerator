'use client';

import { createPortal } from 'react-dom';

import { useThreadListSlot } from '../stores/threadListSlotStore';

import { ChatThreadList } from './ChatThreadList';

interface ChatThreadListPortalProps {
  /**
   * Kept for API compatibility with the host wiring; the slot node is now
   * registered synchronously via `setThreadListSlot` (threadListSlotStore)
   * rather than re-found by id, so this is unused.
   */
  slotId?: string;
}

/**
 * Renders the global thread-list sidebar into a host-provided DOM slot.
 *
 * This lives inside the assistant-ui runtime tree (rendered by
 * GrueneratorChatRuntimeProvider, inside AssistantRuntimeProvider), so
 * ChatThreadList is always mounted with a runtime in scope and co-bundles with
 * the runtime chunk — it can never render in the Suspense fallback before the
 * runtime exists.
 *
 * The slot node is supplied by the host via the threadListSlotStore ref
 * callback — synchronous with commit, so the portal follows the slot atomically
 * across per-route remounts (no async MutationObserver lag → no flicker).
 */
export function ChatThreadListPortal(_props: ChatThreadListPortalProps) {
  const target = useThreadListSlot();

  if (!target) return null;

  // No wrapper handler here: every row is a link that navigates on its own, on
  // /chat and off it alike. The wrapper used to catch bubbled row clicks and
  // navigate to bare /chat, which raced the row's own navigation and made a
  // click from another page hop through the previously open thread first.
  return createPortal(<ChatThreadList noScroll />, target);
}

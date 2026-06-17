'use client';

import { createPortal } from 'react-dom';
import { ChatThreadList } from './ChatThreadList';
import { useThreadListSlot } from '../stores/threadListSlotStore';

interface ChatThreadListPortalProps {
  /**
   * Kept for API compatibility with the host wiring; the slot node is now
   * registered synchronously via `setThreadListSlot` (threadListSlotStore)
   * rather than re-found by id, so this is unused.
   */
  slotId?: string;
  /** Invoked when the user clicks the thread list (e.g. navigate to /chat). */
  onRequestOpen?: () => void;
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
export function ChatThreadListPortal({ onRequestOpen }: ChatThreadListPortalProps) {
  const target = useThreadListSlot();

  if (!target) return null;

  return createPortal(
    <div onClick={onRequestOpen} className="contents">
      <ChatThreadList noScroll />
    </div>,
    target
  );
}

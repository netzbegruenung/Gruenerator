'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChatThreadList } from './ChatThreadList';

interface ChatThreadListPortalProps {
  /** DOM id of the slot to render the thread list into (owned by the host layout). */
  slotId: string;
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
 * runtime exists. The host (app) supplies only the slot id and an open callback.
 */
export function ChatThreadListPortal({ slotId, onRequestOpen }: ChatThreadListPortalProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const sync = () => setTarget(document.getElementById(slotId));
    sync();
    // The slot mounts/unmounts with the sidebar (layout mode, expand/collapse),
    // so track it rather than reading it once.
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [slotId]);

  if (!target) return null;

  return createPortal(
    <div onClick={onRequestOpen} className="contents">
      <ChatThreadList noScroll />
    </div>,
    target
  );
}

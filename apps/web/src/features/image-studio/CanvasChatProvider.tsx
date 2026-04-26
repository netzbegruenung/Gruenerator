import { CanvasEditorProvider } from '@gruenerator/canvas-editor';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { CanvasSharepicChatDialog } from './CanvasSharepicChatDialog';
import { webCanvasEditorServices } from './webCanvasEditorServices';

import type { CanvasEditorServices, ChatOpenContext } from '@gruenerator/canvas-editor';

/**
 * Wraps `CanvasEditorProvider` and injects an `openChat` service that the
 * canvas-editor's ChatSection invokes. Maintains the dialog's open/closed
 * state and renders the `CanvasSharepicChatDialog` as a sibling so the chat
 * overlays the editor without being unmounted on tab switches.
 */
export function CanvasChatProvider({ children }: { children: ReactNode }) {
  const [chatContext, setChatContext] = useState<ChatOpenContext | null>(null);

  const handleClose = useCallback(() => setChatContext(null), []);

  const services = useMemo<CanvasEditorServices>(
    () => ({
      ...webCanvasEditorServices,
      openChat: (ctx) => setChatContext(ctx),
    }),
    []
  );

  return (
    <CanvasEditorProvider services={services}>
      {children}
      {chatContext && <CanvasSharepicChatDialog context={chatContext} onClose={handleClose} />}
    </CanvasEditorProvider>
  );
}

import { CanvasEditorProvider } from '@gruenerator/canvas-editor';
import { useMemo, type ReactNode } from 'react';

import { CanvasInlineChatSection } from './CanvasInlineChatSection';
import { webCanvasEditorServices } from './webCanvasEditorServices';

import type { CanvasEditorServices } from '@gruenerator/canvas-editor';

/**
 * Wraps `CanvasEditorProvider` and injects a `ChatSectionContent` component
 * that the canvas-editor's ChatSection renders inline inside the sidebar.
 */
export function CanvasChatProvider({ children }: { children: ReactNode }) {
  const services = useMemo<CanvasEditorServices>(
    () => ({
      ...webCanvasEditorServices,
      ChatSectionContent: CanvasInlineChatSection,
    }),
    []
  );

  return <CanvasEditorProvider services={services}>{children}</CanvasEditorProvider>;
}

import { CanvasEditorProvider } from '@gruenerator/canvas-editor';
import { useMemo, type ReactNode } from 'react';

import { CanvasInlineChatSection } from './CanvasInlineChatSection';
import { webCanvasEditorServices } from './webCanvasEditorServices';

import type { CanvasEditorServices } from '@gruenerator/canvas-editor';

export function WebCanvasEditorProvider({ children }: { children: ReactNode }) {
  const services = useMemo<CanvasEditorServices>(
    () => ({ ...webCanvasEditorServices, ChatSectionContent: CanvasInlineChatSection }),
    []
  );
  return <CanvasEditorProvider services={services}>{children}</CanvasEditorProvider>;
}

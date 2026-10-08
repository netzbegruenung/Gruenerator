import { CanvasEditorProvider } from '@gruenerator/canvas-editor';
import { useId, useMemo, type ReactNode } from 'react';

import { useAuthStore } from '../../stores/authStore';

import { CanvasChatDraftIdContext } from './CanvasChatDocContext';
import { CanvasInlineChatSection } from './CanvasInlineChatSection';
import { webCanvasEditorServices } from './webCanvasEditorServices';

import type { CanvasEditorServices } from '@gruenerator/canvas-editor';

export function WebCanvasEditorProvider({ children }: { children: ReactNode }) {
  const isAustrianUser = useAuthStore((s) => s.locale === 'de-AT');
  const draftId = useId();
  const services = useMemo<CanvasEditorServices>(
    () => ({
      ...webCanvasEditorServices,
      ChatSectionContent: CanvasInlineChatSection,
      userLocale: isAustrianUser ? 'de-AT' : 'de-DE',
    }),
    [isAustrianUser]
  );
  return (
    <CanvasEditorProvider services={services}>
      <CanvasChatDraftIdContext.Provider value={draftId}>
        {children}
      </CanvasChatDraftIdContext.Provider>
    </CanvasEditorProvider>
  );
}

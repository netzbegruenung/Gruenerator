import { CanvasEditorProvider } from '@gruenerator/canvas-editor';
import { useMemo, type ReactNode } from 'react';

import { useAuthStore } from '../../stores/authStore';

import { CanvasInlineChatSection } from './CanvasInlineChatSection';
import { webCanvasEditorServices } from './webCanvasEditorServices';

import type { CanvasEditorServices } from '@gruenerator/canvas-editor';

export function WebCanvasEditorProvider({ children }: { children: ReactNode }) {
  const isAustrianUser = useAuthStore((s) => s.user?.locale === 'de-AT');
  const services = useMemo<CanvasEditorServices>(
    () => ({
      ...webCanvasEditorServices,
      ChatSectionContent: CanvasInlineChatSection,
      userLocale: isAustrianUser ? 'de-AT' : 'de-DE',
    }),
    [isAustrianUser]
  );
  return <CanvasEditorProvider services={services}>{children}</CanvasEditorProvider>;
}

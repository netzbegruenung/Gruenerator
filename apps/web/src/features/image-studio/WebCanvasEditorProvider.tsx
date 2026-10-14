import { CanvasEditorProvider } from '@gruenerator/canvas-editor';
import { useId, useMemo, type ReactNode } from 'react';

import { useAuthStore } from '../../stores/authStore';

import { CanvasChatDraftIdContext } from './CanvasChatDocContext';
import { webCanvasEditorServices } from './webCanvasEditorServices';

import type { CanvasEditorServices } from '@gruenerator/canvas-editor';

export function WebCanvasEditorProvider({
  children,
  allowStickerCreator = true,
}: {
  children: ReactNode;
  /** False where `window.open` goes nowhere, e.g. inside the native app's WebView. */
  allowStickerCreator?: boolean;
}) {
  const isAustrianUser = useAuthStore((s) => s.locale === 'de-AT');
  const draftId = useId();
  const services = useMemo<CanvasEditorServices>(() => {
    const { openStickerCreator, ...rest } = webCanvasEditorServices;
    return {
      ...rest,
      ...(allowStickerCreator && openStickerCreator ? { openStickerCreator } : {}),
      userLocale: isAustrianUser ? 'de-AT' : 'de-DE',
    };
  }, [isAustrianUser, allowStickerCreator]);
  return (
    <CanvasEditorProvider services={services}>
      <CanvasChatDraftIdContext.Provider value={draftId}>
        {children}
      </CanvasChatDraftIdContext.Provider>
    </CanvasEditorProvider>
  );
}

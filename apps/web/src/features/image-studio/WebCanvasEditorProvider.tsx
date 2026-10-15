import { CanvasEditorProvider } from '@gruenerator/canvas-editor';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../stores/authStore';
import { sharepicVorlagenQuery } from '../vorlagen/hooks/useSharepicVorlagen';

import { CanvasChatDraftIdContext } from './CanvasChatDocContext';
import { webCanvasEditorServices } from './webCanvasEditorServices';

import type { CanvasEditorServices, VorlagePage } from '@gruenerator/canvas-editor';
import type { SharepicVorlage } from '@gruenerator/contracts';

/**
 * A Vorlage as pages for the open design — the same composition as the copy
 * at /studio/vorlage/:id, with the spec kept on the pages for the chat. Loaded
 * on the first pick: opening the editor does not need the composer.
 */
async function composeVorlage(vorlage: SharepicVorlage): Promise<VorlagePage[]> {
  const { canvasSeed, composeCreatorSharepic, creatorPhotoSrc } =
    await import('./freitext/composeForRender');
  // A plain copy is hand-made from stock photos, so it carries no AI label.
  const composed = await composeCreatorSharepic(
    vorlage.spec,
    vorlage.attributions,
    creatorPhotoSrc,
    false
  );
  const { pages } = canvasSeed(composed, {
    base: vorlage.spec,
    tweaks: {},
    attributions: vorlage.attributions,
  });
  return pages.map(({ configId, state }) => ({ configId, state }));
}

export function WebCanvasEditorProvider({
  children,
  allowStickerCreator = true,
  allowVorlagen = true,
}: {
  children: ReactNode;
  /** False where `window.open` goes nowhere, e.g. inside the native app's WebView. */
  allowStickerCreator?: boolean;
  /** False where the design must not be replaced: read-only viewers, the app's postMessage editor. */
  allowVorlagen?: boolean;
}) {
  const isAustrianUser = useAuthStore((s) => s.locale === 'de-AT');
  const draftId = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const services = useMemo<CanvasEditorServices>(() => {
    const { openStickerCreator, ...rest } = webCanvasEditorServices;
    return {
      ...rest,
      ...(allowStickerCreator && openStickerCreator ? { openStickerCreator } : {}),
      ...(allowVorlagen
        ? {
            vorlagen: {
              list: () => queryClient.fetchQuery(sharepicVorlagenQuery()),
              compose: composeVorlage,
              // Same tab: the design is saved as it is edited, and Back returns to it.
              openAsNew: (vorlage: SharepicVorlage) =>
                void navigate(`/studio/vorlage/${encodeURIComponent(vorlage.id)}`),
            },
          }
        : {}),
      userLocale: isAustrianUser ? 'de-AT' : 'de-DE',
    };
  }, [isAustrianUser, allowStickerCreator, allowVorlagen, navigate, queryClient]);
  return (
    <CanvasEditorProvider services={services}>
      <CanvasChatDraftIdContext.Provider value={draftId}>
        {children}
      </CanvasChatDraftIdContext.Provider>
    </CanvasEditorProvider>
  );
}

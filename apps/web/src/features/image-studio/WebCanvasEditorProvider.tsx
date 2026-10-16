import { CanvasEditorProvider } from '@gruenerator/canvas-editor';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, type ReactNode } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { usePrintVorlage } from '../vorlagen/hooks/usePrintVorlage';
import { canvasVorlagenQuery, sharepicSeitenQuery } from '../vorlagen/hooks/useSharepicVorlagen';

import { CanvasChatDraftIdContext } from './CanvasChatDocContext';
import { webCanvasEditorServices } from './webCanvasEditorServices';

import type { CanvasEditorServices, VorlagePage } from '@gruenerator/canvas-editor';
import type {
  SharepicFormat,
  SharepicPhotoAttribution,
  SharepicSeite,
  SharepicSpec,
} from '@gruenerator/contracts';

/**
 * A spec as pages for the open design — the same composition as the copy at
 * /studio/vorlage/:id, with the spec kept on the pages for the chat. Loaded
 * on the first pick: opening the editor does not need the composer.
 */
async function composeSpec(
  spec: SharepicSpec,
  attributions: (SharepicPhotoAttribution | null)[]
): Promise<VorlagePage[]> {
  const { canvasSeed, composeCreatorSharepic, creatorPhotoSrc } =
    await import('./freitext/composeForRender');
  // A plain copy is hand-made from stock photos, so it carries no AI label.
  const composed = await composeCreatorSharepic(spec, attributions, creatorPhotoSrc, false);
  const { pages } = canvasSeed(composed, { base: spec, tweaks: {}, attributions });
  return pages.map(({ configId, state }) => ({ configId, state }));
}

/** A single Seite, composed in the design's format. */
const composeSeite = (seite: SharepicSeite, format: SharepicFormat) =>
  composeSpec({ locale: seite.locale, format, slides: [seite.slide] }, [seite.attribution]);

export function WebCanvasEditorProvider({
  children,
  allowStickerCreator = true,
  allowVorlagen = true,
}: {
  children: ReactNode;
  /** False where `window.open` goes nowhere, e.g. inside the native app's WebView. */
  allowStickerCreator?: boolean;
  /** False where the design must not be changed: read-only viewers, the app's postMessage editor. */
  allowVorlagen?: boolean;
}) {
  const isAustrianUser = useAuthStore((s) => s.locale === 'de-AT');
  const draftId = useId();
  const queryClient = useQueryClient();
  // The gallery's „Verwenden": compose the print Vorlage into a new canvas and open it.
  const { openPrintVorlage } = usePrintVorlage();
  const services = useMemo<CanvasEditorServices>(() => {
    const { openStickerCreator, ...rest } = webCanvasEditorServices;
    return {
      ...rest,
      ...(allowStickerCreator && openStickerCreator ? { openStickerCreator } : {}),
      ...(allowVorlagen
        ? {
            vorlagen: {
              listSeiten: () => queryClient.fetchQuery(sharepicSeitenQuery()),
              composeSeite,
              listCanvas: () => queryClient.fetchQuery(canvasVorlagenQuery()),
              openPrintAsNew: (vorlage) => void openPrintVorlage(vorlage),
            },
          }
        : {}),
      userLocale: isAustrianUser ? 'de-AT' : 'de-DE',
    };
  }, [isAustrianUser, allowStickerCreator, allowVorlagen, queryClient, openPrintVorlage]);
  return (
    <CanvasEditorProvider services={services}>
      <CanvasChatDraftIdContext.Provider value={draftId}>
        {children}
      </CanvasChatDraftIdContext.Provider>
    </CanvasEditorProvider>
  );
}

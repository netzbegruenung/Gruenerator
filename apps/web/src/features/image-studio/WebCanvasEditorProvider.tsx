import { CanvasEditorProvider } from '@gruenerator/canvas-editor';
import { sharepicBlockSpec, sharepicSeiteSpec } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { canRequestFeedback, requestFeedback } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, type ReactNode } from 'react';

import { useAuthStore } from '../../stores/authStore';
import { fillSpecWithText } from '../vorlagen/fillSpecWithText';
import { usePrintVorlage } from '../vorlagen/hooks/usePrintVorlage';
import {
  canvasVorlagenQuery,
  folienVorlagenQuery,
  printVorlagenQuery,
  sharepicBloeckeQuery,
  sharepicSeitenQuery,
} from '../vorlagen/hooks/useSharepicVorlagen';

import { CanvasChatDraftIdContext } from './CanvasChatDocContext';
import { webCanvasEditorServices } from './webCanvasEditorServices';

import type { CanvasEditorServices, VorlagePage } from '@gruenerator/canvas-editor';
import type {
  SharepicBlock,
  SharepicBrand,
  SharepicColor,
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
  attributions: (SharepicPhotoAttribution | null)[],
  aiWritten = false
): Promise<VorlagePage[]> {
  const { canvasSeed, composeCreatorSharepic, creatorPhotoSrc } =
    await import('./freitext/composeForRender');
  // A plain copy is hand-made from stock photos; only AI-written text carries the AI label.
  const composed = await composeCreatorSharepic(spec, attributions, creatorPhotoSrc, aiWritten);
  const { pages } = canvasSeed(composed, { base: spec, tweaks: {}, attributions });
  return pages.map(({ configId, state }) => ({ configId, state }));
}

/** A single Seite, composed in the design's format. */
const composeSeite = (seite: SharepicSeite, format: SharepicFormat) =>
  composeSpec(sharepicSeiteSpec(seite, format), [seite.attribution]);

/** „Mit KI hinzufügen": the server picks one of the candidates and writes it as the next page. */
async function draftNextSeite({
  candidates,
  deck,
  format,
  brand,
}: {
  candidates: readonly SharepicSeite[];
  deck: string;
  format: SharepicFormat;
  brand: SharepicBrand;
}) {
  const res = await getContractsClient().sharepicCreator.nextSeite({
    body: { candidates: candidates.map((s) => s.id), deck, format, brand },
  });
  if (res.status !== 200) {
    throw new ApiError(res.status, `Die Seite ließ sich nicht schreiben (HTTP ${res.status}).`);
  }
  const seite = candidates.find((s) => s.id === res.body.seiteId);
  if (!seite) throw new Error(`the server picked an unknown Seite: ${res.body.seiteId}`);
  return { seite, pages: await composeSpec(res.body.spec, res.body.attributions, true) };
}

/** „Vorlage ändern" with the page's own text written into the Seite. */
async function fillSeite(seite: SharepicSeite, format: SharepicFormat, text: string) {
  const filled = await fillSpecWithText(sharepicSeiteSpec(seite, format), text);
  // No silent fallback to the sample copy: the person asked to keep their text.
  if (!filled) throw new Error('the draft did not fill the Seite');
  return composeSpec(filled.spec, filled.attributions, true);
}

/** A block alone on `color`, composed like a Seite; the editor cuts its elements out. */
async function composeBlock(
  block: SharepicBlock,
  { format, color }: { format: SharepicFormat; color: SharepicColor }
) {
  const { composeCreatorSharepic, creatorPhotoSrc } = await import('./freitext/composeForRender');
  const spec = sharepicBlockSpec(block.locale, { ...block, color }, format);
  const composed = await composeCreatorSharepic(spec, [null], creatorPhotoSrc, false);
  return composed.slides[0]!;
}

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
              listSeiten: (brand) => queryClient.fetchQuery(sharepicSeitenQuery(brand)),
              composeSeite,
              draftNextSeite,
              fillSeite,
              listCanvas: () => queryClient.fetchQuery(canvasVorlagenQuery()),
              loadDeckVorlagen: () => queryClient.fetchQuery(folienVorlagenQuery()),
              listPrint: () => queryClient.fetchQuery(printVorlagenQuery()),
              openPrintAsNew: (vorlage) => void openPrintVorlage(vorlage),
              listBloecke: (brand) => queryClient.fetchQuery(sharepicBloeckeQuery(brand)),
              composeBlock,
            },
          }
        : {}),
      feedback: { canRequest: canRequestFeedback, request: requestFeedback },
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

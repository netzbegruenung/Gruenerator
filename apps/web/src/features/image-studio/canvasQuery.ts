import { isValidCanvasType, loadCanvasConfig } from '@gruenerator/canvas-editor/config-loader';
import { type CanvasDocument } from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { type QueryClient, queryOptions, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { loadCanvasStudioPage } from './routeChunks';

// Was der Editor nach dem Dokument als Nächstes braucht, schon jetzt anstoßen:
// den Config-Chunk der Vorlage und das Hintergrundbild. Beide landen im Cache
// (Modul- bzw. HTTP-Cache), bevor der Editor sie selbst anfordert.
function warmEditorAssets(canvas: CanvasDocument) {
  if (isValidCanvasType(canvas.template_type)) {
    loadCanvasConfig(canvas.template_type, canvas.format).catch(() => {});
  }
  const bg = canvas.initial_state.currentImageSrc;
  if (typeof bg === 'string' && bg) new Image().src = bg;
}

export const canvasQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ['canvas', id],
    // Die Seite zeigt den Fehler selbst; ein Prefetch (Hover, Direktaufruf)
    // soll keinen Toast werfen.
    meta: { silent: true },
    queryFn: async (): Promise<CanvasDocument> => {
      const result = await getContractsClient().canvas.get({ params: { id } });
      if (result.status !== 200) {
        throw new ApiError(result.status, `Failed to load canvas (HTTP ${result.status})`);
      }
      warmEditorAssets(result.body);
      return result.body;
    },
  });

/** Route-Chunk und Dokument vorladen, auf das ein Öffnen sonst warten würde. */
export function prefetchCanvasEditor(queryClient: QueryClient, id: string) {
  void loadCanvasStudioPage();
  void queryClient.prefetchQuery(canvasQueryOptions(id));
}

/** Für Hover/Fokus auf Canvas-Links. */
export function useCanvasEditorPrefetch() {
  const queryClient = useQueryClient();
  return useCallback((id: string) => prefetchCanvasEditor(queryClient, id), [queryClient]);
}

/** Nach dem Anlegen: das frische Dokument direkt in den Cache legen. */
export function seedCanvasQuery(queryClient: QueryClient, canvas: CanvasDocument) {
  queryClient.setQueryData(canvasQueryOptions(canvas.id).queryKey, canvas);
  warmEditorAssets(canvas);
  void loadCanvasStudioPage();
}

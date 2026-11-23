import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/**
 * Für Hover/Fokus auf Canvas-Links. Lädt canvasQuery erst bei der Absicht:
 * das Modul registriert die Canvas-Host-Daten (canvasHost), und eine Liste wie
 * „Zuletzt" auf /start soll sie nicht schon beim Rendern mitbringen (#5891).
 */
export function useCanvasEditorPrefetch() {
  const queryClient = useQueryClient();
  return useCallback(
    (id: string) => {
      void import('./canvasQuery').then(({ prefetchCanvasEditor }) =>
        prefetchCanvasEditor(queryClient, id)
      );
    },
    [queryClient]
  );
}

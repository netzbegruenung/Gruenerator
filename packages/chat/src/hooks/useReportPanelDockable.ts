import { useEffect } from 'react';

import { useArtifactLiveStore } from '../stores/artifactLiveStore';

/**
 * Meldet dem Artefakt-Store, ob die Schiene gerade andocken kann — also ob die
 * Chat-Spalte breit genug ist, dass sie neben dem Faden steht statt sich über
 * ihn zu legen.
 *
 * Nur der Host kennt diese Breite (er misst seine eigene Box, nicht das
 * Fenster), und nur der Store ist von dort aus für den SSE-Parser erreichbar,
 * der entscheiden muss, ob ein eingehendes Artefakt von selbst aufziehen darf.
 * Beim Unmount wieder `false`: keine Chat-Seite, keine Schiene.
 */
export function useReportPanelDockable(dockable: boolean): void {
  useEffect(() => {
    useArtifactLiveStore.getState().setPanelDockable(dockable);
    return () => useArtifactLiveStore.getState().setPanelDockable(false);
  }, [dockable]);
}

import { isMacPlatform } from '@ggraphic/editor/utils/canvasCommandRegistry';
import { contextPressSelection, itemsUnderPointer } from '@ggraphic/editor/utils/deepSelect';
import { useEffect } from 'react';

import { useCanvasStore } from '../stores/CanvasStoreProvider';

import type { CanvasStageRef } from '../primitives/CanvasStage';

/**
 * Was ein Rechtsklick (auf dem Mac auch ⌃-Klick) auswählt, bevor das
 * Kontextmenü aufgeht. Liegt unter dem Zeiger schon etwas Ausgewähltes, bleibt
 * die Auswahl — auch eine Mehrfachauswahl, die ein gewöhnlicher Druck beim
 * Loslassen auf ein Element zusammenklappen würde. Sonst wird das oberste
 * Element ausgewählt, auf leerer Fläche nichts.
 *
 * Der Druck wird Konva genommen wie in `useDeepSelect`: kein Primitiv wählt
 * sich dann selbst, kein Zug, kein Auswahlrahmen. So ist das Ergebnis auf jedem
 * System dasselbe — macOS schickt `contextmenu` schon beim Drücken, Windows
 * erst beim Loslassen.
 */
export function useContextPress(
  stageRef: React.RefObject<CanvasStageRef | null>,
  enabled: boolean,
  isMac: () => boolean = isMacPlatform
): void {
  const store = useCanvasStore();

  useEffect(() => {
    const stage = stageRef.current?.getStage();
    if (!stage || !enabled) return;
    const container = stage.container();

    const onMouseDown = (e: MouseEvent) => {
      const isContextPress = e.button === 2 || (e.button === 0 && e.ctrlKey && isMac());
      // Im Ausschnitt gehört der Druck dem Foto im Rahmen.
      if (!isContextPress || store.getState().croppingElement) return;
      stage.setPointersPositions(e);
      const pos = stage.getPointerPosition();
      if (!pos) return;
      const stack = itemsUnderPointer(stage, pos).map((item) => item.id);
      const next = contextPressSelection(stack, store.getState().selectedLayerIds);
      if (next) store.getState().setSelectedLayers(next);
      // Popover schließen beim Druck außerhalb — die Seite darüber muss ihn hören.
      e.stopImmediatePropagation();
      (container.parentElement ?? document).dispatchEvent(new MouseEvent(e.type, e));
    };

    container.addEventListener('mousedown', onMouseDown, true);
    return () => container.removeEventListener('mousedown', onMouseDown, true);
  }, [stageRef, enabled, isMac, store]);
}

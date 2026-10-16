import Konva from 'konva';
import { useCallback, useEffect, useRef } from 'react';

import { useCanvasStore } from '../stores/CanvasStoreProvider';
import { canStartMarquee, itemsInRect, SELECTION_COLOR, syncOutlines } from '../utils/multiSelect';

import type { CanvasStageRef } from '../primitives/CanvasStage';

const MARQUEE_FILL = 'rgba(0, 161, 255, 0.08)';
/** Unter dieser Strecke (Bildschirm-px) bleibt der Druck ein gewöhnlicher Klick. */
const ACTIVATION_DISTANCE = 4;

/**
 * Auswahlrahmen: Maus auf leerer Fläche oder einem nicht ziehbaren Hintergrund
 * drücken und ziehen wählt jedes ziehbare Element, das der Rahmen schneidet
 * (mit Shift zur bestehenden Auswahl hinzu). Was der Rahmen gerade trifft,
 * bekommt schon während des Zugs einen Umriss; in den Store geht die Auswahl
 * erst beim Loslassen — sonst schalteten Sidebar und Sheets bei jedem
 * Zwischenstand um. Nur Maus — auf Touch gehört die
 * Geste dem Scrollen.
 *
 * Gibt eine Funktion zurück, die genau einmal `true` liefert, wenn der letzte
 * Druck ein Rahmenzug war: Konva feuert danach noch `click` auf den Hintergrund
 * unter dem Mauszeiger, und dessen Auswahl darf die des Rahmens nicht ersetzen.
 */
export function useMarqueeSelection(
  stageRef: React.RefObject<CanvasStageRef | null>,
  enabled: boolean
): () => boolean {
  const store = useCanvasStore();
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const stage = stageRef.current?.getStage();
    const layer = stage?.getLayers()[0];
    if (!stage || !layer || !enabled) return;

    const rect = new Konva.Rect({
      name: 'selection-chrome',
      stroke: SELECTION_COLOR,
      strokeWidth: 1,
      strokeScaleEnabled: false,
      fill: MARQUEE_FILL,
      listening: false,
      visible: false,
    });
    layer.add(rect);

    // Vorschau: ein Umriss je getroffenem Element, wiederverwendet über die Züge.
    const outlines: Konva.Rect[] = [];
    const showPreview = (nodes: readonly Konva.Node[]) => syncOutlines(layer, outlines, nodes);

    let cleanupDrag: (() => void) | null = null;

    // Jeder neue Druck beginnt ohne Altlast — auch wenn nach dem letzten
    // Rahmenzug gar kein Klick auf ein Element kam.
    const resetSuppress = () => {
      suppressClickRef.current = false;
    };
    const container = stage.container();
    container.addEventListener('pointerdown', resetSuppress, true);

    const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (e.evt.button !== 0 || !canStartMarquee(e.target)) return;
      const startScreen = { x: e.evt.clientX, y: e.evt.clientY };
      const start = layer.getRelativePointerPosition();
      if (!start) return;
      const additive = e.evt.shiftKey;
      let active = false;

      const onMove = (evt: MouseEvent) => {
        if (!active) {
          const dist = Math.hypot(evt.clientX - startScreen.x, evt.clientY - startScreen.y);
          if (dist < ACTIVATION_DISTANCE) return;
          active = true;
          suppressClickRef.current = true;
          // Ohne Shift ersetzt der Rahmen die Auswahl — die alte soll während
          // des Zugs nicht neben der Vorschau stehen bleiben.
          const { selectedLayerIds, setSelectedLayers } = store.getState();
          if (!additive && selectedLayerIds.length > 0) setSelectedLayers([]);
          rect.moveToTop();
        }
        stage.setPointersPositions(evt);
        const pos = layer.getRelativePointerPosition();
        if (!pos) return;
        rect.setAttrs({
          x: Math.min(start.x, pos.x),
          y: Math.min(start.y, pos.y),
          width: Math.abs(pos.x - start.x),
          height: Math.abs(pos.y - start.y),
          visible: true,
        });
        showPreview(itemsInRect(layer, rect.getClientRect()).map((hit) => hit.node));
        layer.batchDraw();
      };

      const finish = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', finish);
        cleanupDrag = null;
        if (!active) return;
        const hits = itemsInRect(layer, rect.getClientRect()).map((hit) => hit.id);
        rect.visible(false);
        showPreview([]);
        layer.batchDraw();
        const { selectedLayerIds, setSelectedLayers } = store.getState();
        setSelectedLayers(additive ? [...selectedLayerIds, ...hits] : hits);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', finish);
      cleanupDrag = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', finish);
      };
    };

    stage.on('mousedown.marquee', onMouseDown);
    return () => {
      stage.off('mousedown.marquee');
      container.removeEventListener('pointerdown', resetSuppress, true);
      cleanupDrag?.();
      rect.destroy();
      outlines.forEach((outline) => outline.destroy());
    };
  }, [stageRef, enabled, store]);

  return useCallback(() => {
    const suppress = suppressClickRef.current;
    suppressClickRef.current = false;
    return suppress;
  }, []);
}

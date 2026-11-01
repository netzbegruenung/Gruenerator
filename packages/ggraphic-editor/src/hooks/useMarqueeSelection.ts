// SPDX-License-Identifier: MPL-2.0
import { useCallback, useEffect, useRef } from 'react';

import { useCanvasStore } from '@ggraphic/editor/stores/CanvasStoreProvider';
import {
  canStartMarquee,
  itemsInRect,
  SELECTION_COLOR,
  syncOutlines,
} from '@ggraphic/editor/utils/multiSelect';

import type { CanvasStageRef } from '../primitives/CanvasStage.js';
import type Konva from 'konva';

const MARQUEE_FILL = 'rgba(0, 161, 255, 0.08)';
/** Unter dieser Strecke (Bildschirm-px) bleibt der Druck ein gewöhnlicher Klick. */
const ACTIVATION_DISTANCE = 4;

export interface MarqueeSelection {
  /**
   * Liefert genau einmal `true`, wenn der letzte Druck ein Rahmenzug war:
   * Konva feuert danach noch `click` auf den Hintergrund unter dem Mauszeiger,
   * und dessen Auswahl darf die des Rahmens nicht ersetzen.
   */
  consumeMarqueeClick: () => boolean;
  /** Beginnt einen Rahmenzug mit einem Druck außerhalb der Bühne (Arbeitsfläche). */
  beginMarquee: (evt: MouseEvent) => void;
}

/**
 * Auswahlrahmen: Maus auf leerer Fläche, einem nicht ziehbaren Hintergrund
 * oder der Arbeitsfläche um das Bild drücken und ziehen wählt jedes ziehbare
 * Element, das der Rahmen schneidet (mit Shift zur bestehenden Auswahl hinzu).
 *
 * Der Rahmen selbst ist ein DOM-Element in Bildschirmkoordinaten, kein
 * Konva-Knoten: die Leinwand endet am Bildrand, ein Rahmen darin wäre dort
 * abgeschnitten. Getroffen wird in Bühnenkoordinaten — Konva rechnet
 * Zeigerpositionen auch außerhalb der Leinwand um.
 *
 * Was der Rahmen gerade trifft, bekommt schon während des Zugs einen Umriss;
 * in den Store geht die Auswahl erst beim Loslassen — sonst schalteten
 * Sidebar und Sheets bei jedem Zwischenstand um. Während des Zugs rendert
 * keine React-Komponente. Nur Maus — auf Touch gehört die Geste dem Scrollen.
 */
export function useMarqueeSelection(
  stageRef: React.RefObject<CanvasStageRef | null>,
  enabled: boolean
): MarqueeSelection {
  const store = useCanvasStore();
  const suppressClickRef = useRef(false);
  const startRef = useRef<((evt: MouseEvent) => void) | null>(null);

  useEffect(() => {
    const stage = stageRef.current?.getStage();
    const layer = stage?.getLayers()[0];
    if (!stage || !layer || !enabled) return;

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

    /** Zeigerposition in Bühnenkoordinaten, auch außerhalb der Leinwand. */
    const stagePoint = (evt: MouseEvent) => {
      stage.setPointersPositions(evt);
      return stage.getPointerPosition();
    };

    const start = (down: MouseEvent) => {
      if (down.button !== 0) return;
      cleanupDrag?.();
      const startScreen = { x: down.clientX, y: down.clientY };
      const startStage = stagePoint(down);
      if (!startStage) return;
      const additive = down.shiftKey;
      let overlay: HTMLDivElement | null = null;
      let hitRect = { x: 0, y: 0, width: 0, height: 0 };

      const onMove = (evt: MouseEvent) => {
        if (!overlay) {
          const dist = Math.hypot(evt.clientX - startScreen.x, evt.clientY - startScreen.y);
          if (dist < ACTIVATION_DISTANCE) return;
          suppressClickRef.current = true;
          // Ohne Shift ersetzt der Rahmen die Auswahl — die alte soll während
          // des Zugs nicht neben der Vorschau stehen bleiben.
          const { selectedLayerIds, setSelectedLayers } = store.getState();
          if (!additive && selectedLayerIds.length > 0) setSelectedLayers([]);
          overlay = document.createElement('div');
          Object.assign(overlay.style, {
            position: 'fixed',
            pointerEvents: 'none',
            zIndex: '1000',
            border: `1px solid ${SELECTION_COLOR}`,
            background: MARQUEE_FILL,
          });
          document.body.appendChild(overlay);
        }
        Object.assign(overlay.style, {
          left: `${Math.min(startScreen.x, evt.clientX)}px`,
          top: `${Math.min(startScreen.y, evt.clientY)}px`,
          width: `${Math.abs(evt.clientX - startScreen.x)}px`,
          height: `${Math.abs(evt.clientY - startScreen.y)}px`,
        });
        const pos = stagePoint(evt);
        if (!pos) return;
        hitRect = {
          x: Math.min(startStage.x, pos.x),
          y: Math.min(startStage.y, pos.y),
          width: Math.abs(pos.x - startStage.x),
          height: Math.abs(pos.y - startStage.y),
        };
        showPreview(itemsInRect(layer, hitRect).map((hit) => hit.node));
        layer.batchDraw();
      };

      const stop = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', finish);
        overlay?.remove();
        cleanupDrag = null;
      };

      const finish = () => {
        const wasActive = overlay !== null;
        stop();
        if (!wasActive) return;
        const hits = itemsInRect(layer, hitRect).map((hit) => hit.id);
        showPreview([]);
        layer.batchDraw();
        const { selectedLayerIds, setSelectedLayers } = store.getState();
        setSelectedLayers(additive ? [...selectedLayerIds, ...hits] : hits);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', finish);
      cleanupDrag = stop;
    };
    startRef.current = start;

    const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (canStartMarquee(e.target)) start(e.evt);
    };

    stage.on('mousedown.marquee', onMouseDown);
    return () => {
      stage.off('mousedown.marquee');
      container.removeEventListener('pointerdown', resetSuppress, true);
      cleanupDrag?.();
      startRef.current = null;
      outlines.forEach((outline) => outline.destroy());
    };
  }, [stageRef, enabled, store]);

  const consumeMarqueeClick = useCallback(() => {
    const suppress = suppressClickRef.current;
    suppressClickRef.current = false;
    return suppress;
  }, []);
  const beginMarquee = useCallback((evt: MouseEvent) => startRef.current?.(evt), []);

  return { consumeMarqueeClick, beginMarquee };
}

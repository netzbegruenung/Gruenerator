// SPDX-License-Identifier: MPL-2.0
import Konva from 'konva';
import { useEffect, useRef } from 'react';

import { useCanvasStore } from '@ggraphic/editor/stores/CanvasStoreProvider';
import { itemBodyRect, itemsUnderPointer, nextDeepTarget } from '@ggraphic/editor/utils/deepSelect';

import type { CanvasStageRef } from '../primitives/CanvasStage.js';

const OUTLINE_STROKE = 'rgb(0, 161, 255)';

const defaultIsMac = () => typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

/**
 * Canva's "select what lies beneath": ctrl-click (⌘-click on a Mac) selects
 * the item below the pointer, the next one goes one deeper and wraps round.
 * A sharepic's photo lies under its colour panel and AT tint; this is how it
 * stays reachable now that those are ordinary shapes.
 *
 * Runs on the native press, before Konva: Konva would hand it to the topmost
 * shape, which selects itself and arms its own drag. Instead the press is
 * replayed on the target's shape, so the item's own handler selects it and
 * Konva arms the target's drag — a ctrl-press-and-drag moves it in one go.
 *
 * While a deep-picked item stays selected, a plain press on it (it is under
 * whatever covers it) drags it, as in Canva and Figma; a plain click without
 * moving selects the top item again. An outline marks the covered selection,
 * whose own Transformer is drawn under the cover.
 */
export function useDeepSelect(
  stageRef: React.RefObject<CanvasStageRef | null>,
  enabled: boolean,
  isMac: () => boolean = defaultIsMac
): void {
  const store = useCanvasStore();
  // The deep-picked item outlives a re-run of the effect (a new stage, a new `isMac`).
  const deepRef = useRef<string | null>(null);

  useEffect(() => {
    const stage = stageRef.current?.getStage();
    const layer = stage?.getLayers()[0];
    if (!stage || !layer || !enabled) return;
    const container = stage.container();

    const outline = new Konva.Rect({
      name: 'selection-chrome',
      stroke: OUTLINE_STROKE,
      strokeWidth: 1.5,
      dash: [6, 4],
      strokeScaleEnabled: false,
      listening: false,
      visible: false,
    });
    layer.add(outline);

    const drawOutline = () => {
      const body = deepRef.current === null ? null : itemBodyRect(stage, deepRef.current, layer);
      if (body) {
        outline.setAttrs({ ...body, visible: true });
        outline.moveToTop();
      } else {
        outline.visible(false);
      }
      layer.batchDraw();
    };

    const unsubscribe = store.subscribe((state, prev) => {
      if (state.selectedElement === prev.selectedElement) return;
      if (state.selectedElement !== deepRef.current) deepRef.current = null;
      drawOutline();
    });

    /** Replays the native press on `shape`: its item selects itself, Konva arms its drag. */
    /**
     * Takes the press away from Konva, which would otherwise select and arm
     * the topmost shape. The page above still has to hear it: popovers close
     * on a document-level mousedown outside them, and the press was outside.
     * Re-sent from the container's parent, so this capture listener stays out.
     */
    const claim = (e: MouseEvent) => {
      e.stopPropagation();
      (container.parentElement ?? document).dispatchEvent(new MouseEvent(e.type, e));
    };

    const press = (shape: Konva.Shape, evt: MouseEvent) => {
      shape.fire('mousedown', { evt, target: shape }, true);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0 || Konva.isTransforming()) return;
      stage.setPointersPositions(e);
      const pos = stage.getPointerPosition();
      if (!pos) return;
      // A resize or rotate handle stays the Transformer's.
      if (stage.getIntersection(pos)?.getParent() instanceof Konva.Transformer) return;

      const modifier = isMac() ? e.metaKey : e.ctrlKey;
      const selected = store.getState().selectedElement;
      // The common press — no modifier, no covered selection — stays Konva's
      // alone; the stack below costs a hit pass per shape.
      if (!modifier && (deepRef.current === null || deepRef.current !== selected)) return;

      const stack = itemsUnderPointer(stage, pos);
      if (stack.length < 2) return;

      if (modifier) {
        const target = nextDeepTarget(stack, selected)!;
        claim(e);
        // Wrapped round to the top: nothing is covered any more.
        deepRef.current = target === stack[0] ? null : target.id;
        press(target.shape, e);
        drawOutline();
        return;
      }

      const covered = stack.findIndex((item) => item.id === deepRef.current);
      if (covered <= 0) return;
      claim(e);
      press(stack[covered]!.shape, e);
      const top = stack[0]!.id;
      let dragged = false;
      const onDragStart = () => {
        dragged = true;
      };
      stage.on('dragstart.deepSelect', onDragStart);
      window.addEventListener(
        'mouseup',
        () => {
          stage.off('dragstart.deepSelect');
          if (dragged) drawOutline();
          else store.getState().setSelectedElement(top);
        },
        { once: true }
      );
    };

    stage.on('dragmove.deepSelect dragend.deepSelect', () => {
      if (deepRef.current !== null) drawOutline();
    });
    container.addEventListener('mousedown', onMouseDown, true);
    return () => {
      container.removeEventListener('mousedown', onMouseDown, true);
      stage.off('.deepSelect');
      unsubscribe();
      outline.destroy();
    };
  }, [stageRef, enabled, isMac, store]);
}

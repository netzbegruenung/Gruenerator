// SPDX-License-Identifier: MPL-2.0
/**
 * Ein Transformer um alle ausgewählten Elemente, sobald es mehr als eines ist.
 *
 * Konva bewegt die Knoten eines Transformers gemeinsam: zieht man einen, ruft
 * es auf allen anderen `startDrag` auf, und jeder feuert sein eigenes
 * `dragend`. Jedes Element schreibt seine Position also über denselben Weg
 * zurück wie beim Einzelzug. Drehen geht, wenn jedes gewählte Element eine Tür
 * dafür hat (`canRotate`): Konva feuert erst das `transformend` des Transformers,
 * dann synchron das jedes Knotens, und jede Elementart schreibt Drehung und
 * Position auf ihrem eigenen Weg zurück. Die entprellten und sofortigen Speicherungen
 * lesen den festgeschriebenen Zustand und werden so ein Undo-Schritt.
 * Skalieren bleibt aus — jede Elementart deutet es anders (Text: Breite, Balken:
 * Offset, Rahmen: gleichmäßige Skala).
 *
 * Neben dem Rahmen um die ganze Auswahl trägt jedes Element einen eigenen
 * Umriss, auch ein gesperrtes, das beim Zug stehen bleibt. Die Umrisse sind lose Konva-Knoten, die dem `dragmove` des
 * Transformers folgen — ein Gruppenzug rendert keine React-Komponente neu.
 *
 * Mit Bühnenmassen rastet der Gruppenzug ein (`utils/groupSnap.ts`): im
 * `dragmove` des Transformers, nachdem Konva alle Knoten gesetzt hat und bevor
 * die Umrisse folgen. Die Elemente selbst rasten im Gruppenzug nicht einzeln ein
 * (`isGroupDrag`).
 */

import { memo, useCallback, useEffect, useRef } from 'react';
import { Transformer } from 'react-konva';

import { useSnapScheduler } from '@ggraphic/editor/hooks/useSnapScheduler';
import { measureGroupSnap, snapGroup, type GroupSnap } from '@ggraphic/editor/utils/groupSnap';
import {
  findDragNodes,
  findItemGroups,
  MULTI_SELECTION_TRANSFORMER_NAME,
  SELECTION_COLOR,
  syncOutlines,
} from '@ggraphic/editor/utils/multiSelect';
import { ELEMENT_TRANSFORMER } from '@ggraphic/editor/utils/orientation';

import {
  useCanvasStore,
  useCanvasStoreSelector,
  useCanvasStoreShallow,
} from '../stores/CanvasStoreProvider.js';

import type { SnapLine } from '@ggraphic/editor/utils/snapping';
import type Konva from 'konva';

interface MultiSelectionTransformerProps {
  /** Ändert sich, wenn Elemente neu gerendert oder umsortiert werden. */
  renderKey: unknown;
  /**
   * Lässt sich jedes gewählte Element drehen? Eine Funktion, kein Wert: die
   * Auswahl ändert sich, ohne dass die Leinwand neu rendert; gefragt wird, wenn
   * die Knoten des Transformers wechseln.
   */
  canRotate: () => boolean;
  /** Bühnenmasse wie bei den Elementen; ohne sie rastet der Gruppenzug nicht ein. */
  stageWidth?: number;
  stageHeight?: number;
}

function MultiSelectionTransformerInner({
  renderKey,
  canRotate,
  stageWidth,
  stageHeight,
}: MultiSelectionTransformerProps) {
  const trRef = useRef<Konva.Transformer>(null);
  const store = useCanvasStore();
  const onSnapChange = useCallback(
    (h: boolean, v: boolean) => store.getState().setSnapGuides(h, v),
    [store]
  );
  const onSnapLinesChange = useCallback(
    (lines: SnapLine[]) => store.getState().setSnapLines(lines),
    [store]
  );
  // Mit stabilen Rückrufen sind auch die Funktionen des Planers stabil: die
  // Zug-Handler werden nicht bei jedem Render neu angemeldet.
  const { scheduleSnap, onDragStart, onDragEnd, hysteresis } = useSnapScheduler({
    onSnapChange,
    onSnapLinesChange,
  });
  const outlinesRef = useRef<Konva.Rect[]>([]);
  const ids = useCanvasStoreShallow((s) => s.selectedLayerIds);
  const renderVersion = useCanvasStoreSelector((s) => s.renderVersion);

  useEffect(() => {
    const tr = trRef.current;
    const layer = tr?.getLayer();
    if (!tr || !layer) return;
    const found = ids.length > 1 ? findDragNodes(layer, ids) : [];
    const nodes = found.length > 1 ? found : [];
    tr.nodes(nodes);
    tr.rotateEnabled(nodes.length > 1 && canRotate());
    const outlined = ids.length > 1 ? findItemGroups(layer, ids) : [];
    const outlines = outlinesRef.current;
    const follow = () => syncOutlines(layer, outlines, outlined);
    follow();
    tr.moveToTop();
    if (nodes.length > 1 && stageWidth && stageHeight) {
      let group: GroupSnap | null = null;
      tr.on('dragstart.groupSnap', () => {
        const targets = Object.values(store.getState().elementPositions);
        group = measureGroupSnap(tr.nodes(), targets, ids);
        onDragStart();
      });
      // Vor den Umrissen angemeldet: sie folgen schon der eingerasteten Lage.
      tr.on('dragmove.groupSnap', () => {
        if (!group) return;
        const { result, moved } = snapGroup(group, stageWidth, stageHeight, hysteresis);
        if (moved) tr.update();
        scheduleSnap(result.snapH, result.snapV, result.snapLines);
      });
      tr.on('dragend.groupSnap', () => {
        group = null;
        onDragEnd();
      });
    }
    tr.on('dragmove.outlines dragend.outlines', follow);
    layer.batchDraw();
    return () => {
      tr.off('.outlines');
      tr.off('.groupSnap');
    };
  }, [
    ids,
    renderVersion,
    renderKey,
    canRotate,
    stageWidth,
    stageHeight,
    store,
    scheduleSnap,
    onDragStart,
    onDragEnd,
    hysteresis,
  ]);

  useEffect(
    () => () => {
      outlinesRef.current.forEach((outline) => outline.destroy());
      outlinesRef.current = [];
    },
    []
  );

  return (
    <Transformer
      ref={trRef}
      name={MULTI_SELECTION_TRANSFORMER_NAME}
      resizeEnabled={false}
      rotateEnabled={false}
      {...ELEMENT_TRANSFORMER}
      borderStroke={SELECTION_COLOR}
      borderStrokeWidth={1.5}
    />
  );
}

export const MultiSelectionTransformer = memo(MultiSelectionTransformerInner);

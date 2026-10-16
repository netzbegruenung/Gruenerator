/**
 * Ein Transformer um alle ausgewählten Elemente, sobald es mehr als eines ist.
 *
 * Konva bewegt die Knoten eines Transformers gemeinsam: zieht man einen, ruft
 * es auf allen anderen `startDrag` auf, und jeder feuert sein eigenes
 * `dragend`. Jedes Element schreibt seine Position also über denselben Weg
 * zurück wie beim Einzelzug. Skalieren und Drehen sind aus — jede Elementart
 * deutet ein Transform-Ende anders (Text: Breite, Balken: Offset, Rahmen:
 * gleichmäßige Skala).
 */

import { memo, useEffect, useRef } from 'react';
import { Transformer } from 'react-konva';

import { useCanvasStoreSelector, useCanvasStoreShallow } from '../stores/CanvasStoreProvider';
import { findDragNodes, MULTI_SELECTION_TRANSFORMER_NAME } from '../utils/multiSelect';

import type Konva from 'konva';

interface MultiSelectionTransformerProps {
  /** Ändert sich, wenn Elemente neu gerendert oder umsortiert werden. */
  renderKey: unknown;
}

function MultiSelectionTransformerInner({ renderKey }: MultiSelectionTransformerProps) {
  const trRef = useRef<Konva.Transformer>(null);
  const ids = useCanvasStoreShallow((s) => s.selectedLayerIds);
  const renderVersion = useCanvasStoreSelector((s) => s.renderVersion);

  useEffect(() => {
    const tr = trRef.current;
    const layer = tr?.getLayer();
    if (!tr || !layer) return;
    const nodes = ids.length > 1 ? findDragNodes(layer, ids) : [];
    tr.nodes(nodes.length > 1 ? nodes : []);
    tr.moveToTop();
    layer.batchDraw();
  }, [ids, renderVersion, renderKey]);

  return (
    <Transformer
      ref={trRef}
      name={MULTI_SELECTION_TRANSFORMER_NAME}
      resizeEnabled={false}
      rotateEnabled={false}
      borderStroke="rgb(0, 161, 255)"
      borderStrokeWidth={1.5}
    />
  );
}

export const MultiSelectionTransformer = memo(MultiSelectionTransformerInner);

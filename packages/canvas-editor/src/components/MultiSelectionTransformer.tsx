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
 */

import { memo, useEffect, useRef } from 'react';
import { Transformer } from 'react-konva';

import { useCanvasStoreSelector, useCanvasStoreShallow } from '../stores/CanvasStoreProvider';
import {
  findDragNodes,
  findItemGroups,
  MULTI_SELECTION_TRANSFORMER_NAME,
  SELECTION_COLOR,
  syncOutlines,
} from '../utils/multiSelect';
import { ELEMENT_TRANSFORMER } from '../utils/orientation';

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
}

function MultiSelectionTransformerInner({ renderKey, canRotate }: MultiSelectionTransformerProps) {
  const trRef = useRef<Konva.Transformer>(null);
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
    tr.on('dragmove.outlines dragend.outlines', follow);
    layer.batchDraw();
    return () => {
      tr.off('.outlines');
    };
  }, [ids, renderVersion, renderKey, canRotate]);

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

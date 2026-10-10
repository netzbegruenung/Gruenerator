import Konva from 'konva';
import { useEffect } from 'react';

const HOVER_STROKE = 'rgb(0, 161, 255)';

const isBackground = (node: Konva.Node) =>
  node.id() === 'background-image' || node.hasName('canvas-background');

/** The movable element a pointer target belongs to, if any. */
function elementOf(target: Konva.Node, stage: Konva.Stage): Konva.Node | null {
  let node: Konva.Node | null = target;
  while (node && node !== stage) {
    if (node instanceof Konva.Transformer || node.getParent() instanceof Konva.Transformer) {
      return null;
    }
    if (node.draggable()) return isBackground(node) ? null : node;
    node = node.getParent();
  }
  return null;
}

const isSelected = (stage: Konva.Stage, node: Konva.Node) =>
  stage.find<Konva.Transformer>('Transformer').some((tr) => tr.nodes().includes(node));

/**
 * Canva-style hover feedback: a thin outline around the element under the
 * pointer plus a move cursor, so it is clear what a press will grab. One Rect,
 * moved imperatively on pointer-target changes — no React render. Named
 * `selection-chrome`, so every export hides it like the Transformers.
 */
export function useHoverOutline(
  stageRef: React.RefObject<Konva.Stage | null>,
  enabled: boolean
): void {
  useEffect(() => {
    const stage = stageRef.current;
    const layer = stage?.getLayers()[0];
    if (!stage || !layer || !enabled) return;

    const outline = new Konva.Rect({
      name: 'selection-chrome',
      stroke: HOVER_STROKE,
      strokeWidth: 1.5,
      strokeScaleEnabled: false,
      listening: false,
      visible: false,
    });
    layer.add(outline);
    const container = stage.container();

    const hide = () => {
      container.style.cursor = '';
      if (!outline.visible()) return;
      outline.visible(false);
      layer.batchDraw();
    };

    const onOver = (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (Konva.isDragging() || Konva.isTransforming()) return;
      const element = elementOf(e.target, stage);
      if (!element) {
        hide();
        return;
      }
      container.style.cursor = 'move';
      if (isSelected(stage, element)) {
        if (outline.visible()) {
          outline.visible(false);
          layer.batchDraw();
        }
        return;
      }
      outline.setAttrs({ ...element.getClientRect({ relativeTo: layer }), visible: true });
      outline.moveToTop();
      layer.batchDraw();
    };

    stage.on('mouseover.hoverOutline', onOver);
    stage.on('mouseleave.hoverOutline dragstart.hoverOutline mousedown.hoverOutline', hide);
    stage.on('transformstart.hoverOutline', hide);
    return () => {
      stage.off('.hoverOutline');
      container.style.cursor = '';
      outline.destroy();
    };
  }, [stageRef, enabled]);
}

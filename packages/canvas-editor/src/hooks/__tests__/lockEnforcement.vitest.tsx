/**
 * Ein gesperrtes Element: nicht ziehbar, ohne Griffe, vom Auswahlrahmen
 * übersprungen — und in einer Mehrfachauswahl trotzdem umrahmt, auch wenn der
 * Gruppenzug es stehen lässt.
 */
import { CanvasItemLockContext } from '@ggraphic/editor/components/canvasItemLock';
import { MultiSelectionTransformer } from '@ggraphic/editor/components/MultiSelectionTransformer';
import {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
} from '@ggraphic/editor/stores/CanvasStoreProvider';
import { findDragNodes } from '@ggraphic/editor/utils/multiSelect';
import { createShape, type ShapeInstance } from '@ggraphic/editor/utils/shapes';
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { Group } from 'react-konva';
import { describe, expect, it } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage';
import { ShapePrimitive } from '../../primitives/ShapePrimitive';
import { useCanvasInteractions } from '../useCanvasInteractions';

import type { CanvasEditorStoreApi } from '@ggraphic/editor/stores/createCanvasEditorStore';
import type Konva from 'konva';

const box = (id: string, x: number, y: number): ShapeInstance => ({
  ...createShape('rect', x, y, '#888888', '#888888'),
  id,
  width: 80,
  height: 50,
});
// a (gesperrt): 10–90 × 15–65, b: 160–240 × 15–65
const SHAPES = [box('a', 50, 40), box('b', 200, 40)];
const LOCKED = new Set(['a']);

function Host({
  stageRef,
  storeRef,
  onChange,
}: {
  stageRef: React.RefObject<CanvasStageRef | null>;
  storeRef: { current: CanvasEditorStoreApi | null };
  onChange: (id: string) => void;
}) {
  storeRef.current = useCanvasStore();
  const selected = useCanvasStoreSelector((s) => s.selectedElement);
  const { selectElement, handleStageClick } = useCanvasInteractions({
    stageRef,
    marqueeEnabled: true,
  });
  return (
    <CanvasStage
      ref={stageRef}
      width={300}
      height={150}
      responsive={false}
      onStageClick={handleStageClick}
    >
      {SHAPES.map((shape) => (
        <Group key={shape.id} name="canvas-item" canvasItemId={shape.id}>
          <CanvasItemLockContext.Provider value={LOCKED.has(shape.id)}>
            <ShapePrimitive
              shape={shape}
              isSelected={selected === shape.id}
              onSelect={selectElement}
              onChange={() => onChange(shape.id)}
            />
          </CanvasItemLockContext.Provider>
        </Group>
      ))}
      <MultiSelectionTransformer renderKey={SHAPES} canRotate={() => false} />
    </CanvasStage>
  );
}

function mount() {
  const stageRef = createRef<CanvasStageRef>();
  const storeRef: { current: CanvasEditorStoreApi | null } = { current: null };
  const changed: string[] = [];
  render(
    <CanvasStoreProvider>
      <Host stageRef={stageRef} storeRef={storeRef} onChange={(id) => changed.push(id)} />
    </CanvasStoreProvider>
  );
  const stage = stageRef.current!.getStage()!;
  act(() => {
    stage.draw();
  });
  const fire = (target: EventTarget, type: string, x: number, y: number, shift = false) =>
    act(() => {
      const init = {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y,
        shiftKey: shift,
      };
      target.dispatchEvent(new MouseEvent(type.replace('mouse', 'pointer'), init));
      target.dispatchEvent(new MouseEvent(type, init));
    });
  const click = (x: number, y: number, shift = false) => {
    fire(stage.content, 'mousedown', x, y, shift);
    fire(window, 'mouseup', x, y, shift);
  };
  const drag = (x: number, y: number, dx: number, dy: number) => {
    fire(stage.content, 'mousedown', x, y);
    for (let step = 1; step <= 4; step++)
      fire(window, 'mousemove', x + (dx * step) / 4, y + (dy * step) / 4);
    fire(window, 'mouseup', x + dx, y + dy);
  };
  return { stage, state: () => storeRef.current!.getState(), click, drag, changed };
}

const shapeNode = (stage: Konva.Stage, id: string) => stage.findOne(`.shape-${id}`)!;

describe('gesperrtes Element', () => {
  it('lässt sich auswählen, aber nicht ziehen, skalieren oder drehen', () => {
    const { stage, state, click, drag, changed } = mount();
    click(50, 40);
    expect(state().selectedElement).toBe('a');
    expect(shapeNode(stage, 'a').draggable()).toBe(false);
    const transformer = stage
      .find<Konva.Transformer>('Transformer')
      .find((tr) => tr.nodes().length === 1)!;
    expect(transformer.resizeEnabled()).toBe(false);
    expect(transformer.rotateEnabled()).toBe(false);

    drag(50, 40, 30, 20);
    expect(changed).toEqual([]);
  });

  it('wird vom Auswahlrahmen übersprungen', () => {
    const { state, drag } = mount();
    drag(5, 5, 245, 70);
    expect(state().selectedLayerIds).toEqual(['b']);
  });

  it('bleibt in einer Mehrfachauswahl umrahmt, auch ohne mitzuziehen', () => {
    const { stage, state, click } = mount();
    click(50, 40);
    click(200, 40, true);
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
    expect(findDragNodes(stage, ['a', 'b'])).toHaveLength(1);
    const outlines = stage.find('.selection-chrome').filter((node) => node.visible());
    expect(outlines).toHaveLength(2);
  });
});

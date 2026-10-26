/**
 * Der Rechts-Druck auf der Bühne: er wählt aus, was das Kontextmenü betrifft,
 * und klappt eine Mehrfachauswahl nicht auf ein Element zusammen — das tat
 * der gewöhnliche Druck beim Loslassen, auch mit der rechten Taste.
 */
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { Group } from 'react-konva';
import { describe, expect, it } from 'vitest';

import { MultiSelectionTransformer } from '../../components/MultiSelectionTransformer';
import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage';
import { ShapePrimitive } from '../../primitives/ShapePrimitive';
import {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
} from '../../stores/CanvasStoreProvider';
import { createShape, type ShapeInstance } from '../../utils/shapes';
import { useCanvasInteractions } from '../useCanvasInteractions';
import { useContextPress } from '../useContextPress';

import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore';

const box = (id: string, x: number, y: number): ShapeInstance => ({
  ...createShape('rect', x, y, '#888888', '#888888'),
  id,
  width: 80,
  height: 50,
});
// a: 10–90 × 15–65, b: 160–240 × 15–65
const SHAPES = [box('a', 50, 40), box('b', 200, 40)];

function Host({
  stageRef,
  storeRef,
  isMac,
  moved,
}: {
  stageRef: React.RefObject<CanvasStageRef | null>;
  storeRef: { current: CanvasEditorStoreApi | null };
  isMac: () => boolean;
  moved: string[];
}) {
  storeRef.current = useCanvasStore();
  const selected = useCanvasStoreSelector((s) => s.selectedElement);
  const { selectElement, handleStageClick } = useCanvasInteractions({
    stageRef,
    marqueeEnabled: true,
  });
  useContextPress(stageRef, true, isMac);
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
          <ShapePrimitive
            shape={shape}
            isSelected={selected === shape.id}
            onSelect={selectElement}
            onChange={() => moved.push(shape.id)}
          />
        </Group>
      ))}
      <MultiSelectionTransformer renderKey={SHAPES} canRotate={() => false} />
    </CanvasStage>
  );
}

function mount(isMac = () => false) {
  const stageRef = createRef<CanvasStageRef>();
  const storeRef: { current: CanvasEditorStoreApi | null } = { current: null };
  const moved: string[] = [];
  render(
    <CanvasStoreProvider>
      <Host stageRef={stageRef} storeRef={storeRef} isMac={isMac} moved={moved} />
    </CanvasStoreProvider>
  );
  const stage = stageRef.current!.getStage()!;
  act(() => {
    stage.draw();
  });
  const fire = (
    target: EventTarget,
    type: string,
    x: number,
    y: number,
    init: MouseEventInit = {}
  ) =>
    act(() => {
      const event = { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, ...init };
      target.dispatchEvent(new MouseEvent(type.replace('mouse', 'pointer'), event));
      target.dispatchEvent(new MouseEvent(type, event));
    });
  const press = (x: number, y: number, init: MouseEventInit = {}) => {
    fire(stage.content, 'mousedown', x, y, init);
    fire(window, 'mouseup', x, y, init);
  };
  const rightPress = (x: number, y: number) => press(x, y, { button: 2, buttons: 2 });
  return { state: () => storeRef.current!.getState(), press, rightPress, fire, stage, moved };
}

describe('Rechts-Druck', () => {
  it('wählt ein nicht ausgewähltes Element aus', () => {
    const { state, rightPress } = mount();
    rightPress(50, 40);
    expect(state().selectedLayerIds).toEqual(['a']);
  });

  it('lässt die Mehrfachauswahl stehen, wenn eins ihrer Elemente getroffen ist', () => {
    const { state, press, rightPress } = mount();
    press(50, 40);
    press(200, 40, { shiftKey: true });
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
    rightPress(200, 40);
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
  });

  it('ersetzt die Auswahl beim Druck auf ein anderes Element, auch mit Shift', () => {
    const { state, press } = mount();
    press(50, 40);
    press(200, 40, { button: 2, buttons: 2, shiftKey: true });
    expect(state().selectedLayerIds).toEqual(['b']);
  });

  it('hebt die Auswahl auf leerer Bühne auf', () => {
    const { state, press, rightPress } = mount();
    press(50, 40);
    rightPress(130, 120);
    expect(state().selectedLayerIds).toEqual([]);
  });

  it('zieht nichts und startet keinen Auswahlrahmen', () => {
    const { state, fire, stage, moved } = mount(() => true);
    // ⌃-Klick auf dem Mac ist ein Rechtsklick — mit Taste 0, die sonst zöge.
    fire(stage.content, 'mousedown', 50, 40, { ctrlKey: true });
    for (let step = 1; step <= 4; step++)
      fire(window, 'mousemove', 50 + step * 10, 40, { ctrlKey: true });
    fire(window, 'mouseup', 90, 40, { ctrlKey: true });
    expect(state().selectedLayerIds).toEqual(['a']);
    expect(moved).toEqual([]);
  });
});

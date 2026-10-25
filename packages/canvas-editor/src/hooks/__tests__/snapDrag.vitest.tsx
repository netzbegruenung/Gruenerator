/**
 * Snap im echten Zug: eine gedrehte Form rastet mit ihrer gedrehten Box ein,
 * ein Gruppenzug mit dem Umriss aller gezogenen Elemente.
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

import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore';
import type { SnapTarget } from '../../utils/snapping';

// Die jsdom-Leinwand misst 300×150; größer liest Konva keine Pixel für den Treffertest.
const STAGE_W = 300;
const STAGE_H = 150;
// Eine Wand rechts: Kanten x = 260 / 270 / 280. Die Züge bleiben rechts der
// Seitenmitte (150); kämen sie an ihr vorbei, hielte die Hysterese sie dort fest.
const WALL: SnapTarget = { id: 'wall', x: 260, y: 10, width: 20, height: 130 };

const rect = (id: string, x: number, y: number, w: number, h: number, rotation = 0) => ({
  ...createShape('rect', x, y, '#888888', '#888888'),
  id,
  width: w,
  height: h,
  rotation,
});

function Host({
  shapes,
  storeRef,
  stageRef,
  onChange,
}: {
  shapes: ShapeInstance[];
  storeRef: { current: CanvasEditorStoreApi | null };
  stageRef: React.RefObject<CanvasStageRef | null>;
  onChange: (id: string, attrs: Partial<ShapeInstance>) => void;
}) {
  storeRef.current = useCanvasStore();
  const selected = useCanvasStoreSelector((s) => s.selectedElement);
  const { selectElement, handleStageClick, getSnapTargets, handlePositionChange } =
    useCanvasInteractions({
      stageRef,
      marqueeEnabled: true,
    });
  return (
    <CanvasStage
      ref={stageRef}
      width={STAGE_W}
      height={STAGE_H}
      responsive={false}
      onStageClick={handleStageClick}
    >
      {shapes.map((shape) => (
        <Group key={shape.id} name="canvas-item" canvasItemId={shape.id}>
          <ShapePrimitive
            shape={shape}
            isSelected={selected === shape.id}
            onSelect={selectElement}
            onChange={(attrs) => onChange(shape.id, attrs)}
            stageWidth={STAGE_W}
            stageHeight={STAGE_H}
            getSnapTargets={getSnapTargets}
            onGeometryChange={handlePositionChange}
          />
        </Group>
      ))}
      <MultiSelectionTransformer
        renderKey={shapes}
        canRotate={() => false}
        stageWidth={STAGE_W}
        stageHeight={STAGE_H}
      />
    </CanvasStage>
  );
}

function mount(shapes: ShapeInstance[]) {
  const stageRef = createRef<CanvasStageRef>();
  const storeRef: { current: CanvasEditorStoreApi | null } = { current: null };
  const changes: Array<[string, Partial<ShapeInstance>]> = [];
  render(
    <CanvasStoreProvider>
      <Host
        shapes={shapes}
        storeRef={storeRef}
        stageRef={stageRef}
        onChange={(id, attrs) => changes.push([id, attrs])}
      />
    </CanvasStoreProvider>
  );
  const stage = stageRef.current!.getStage()!;
  act(() => {
    storeRef
      .current!.getState()
      .updateElementPosition(WALL.id, WALL.x, WALL.y, WALL.width, WALL.height);
    stage.draw();
  });
  const fire = (target: EventTarget, type: string, x: number, y: number, shift: boolean) =>
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
  const drag = (x: number, y: number, dx: number, dy: number, shift = false) => {
    fire(stage.content, 'mousedown', x, y, shift);
    for (let step = 1; step <= 4; step++) {
      fire(window, 'mousemove', x + (dx * step) / 4, y + (dy * step) / 4, shift);
    }
    fire(window, 'mouseup', x + dx, y + dy, shift);
  };
  const last = (id: string) => [...changes].reverse().find(([cid]) => cid === id)?.[1];
  return { click, drag, last, state: () => storeRef.current!.getState() };
}

describe('Snap im Zug', () => {
  it('rastet eine 90° gedrehte Form mit ihrer gedrehten Box an der Wand ein', () => {
    // 40×20, um 90° gedreht: Box 170–190. Nach +62 läge die rechte Kante bei 252.
    const { drag, last } = mount([rect('a', 180, 75, 40, 20, 90)]);
    drag(180, 75, 62, 0);
    expect(last('a')?.x).toBeCloseTo(250, 6);
    expect(last('a')?.y).toBeCloseTo(75, 6);
  });

  it('meldet die gedrehte Box als Snap-Ziel', () => {
    const { state } = mount([rect('a', 180, 75, 40, 20, 90)]);
    const target = state().elementPositions['a'];
    expect(target?.x).toBeCloseTo(170, 6);
    expect(target?.width).toBeCloseTo(20, 6);
  });

  it('rastet den Umriss eines Gruppenzugs ein und schiebt alle um dieselbe Strecke', () => {
    // a: 160–200 × 30–50, b: 165–195 × 90–110 → Umriss 160–200.
    const { click, drag, last, state } = mount([
      rect('a', 180, 40, 40, 20),
      rect('b', 180, 100, 30, 20),
    ]);
    click(180, 40);
    click(180, 100, true);
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
    // +52 legt die rechte Umrisskante auf 252; sie rastet auf 260.
    drag(180, 40, 52, 0);
    expect(last('a')?.x).toBeCloseTo(240, 6);
    expect(last('b')?.x).toBeCloseTo(240, 6);
    // Senkrecht zieht die Seitenmitte beide gleich weit.
    expect(last('a')!.y! - 40).toBeCloseTo(last('b')!.y! - 100, 6);
    expect(state().snapLines).toEqual([]);
  });
});

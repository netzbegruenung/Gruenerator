/**
 * Mehrfachauswahl: Shift-Klick und Auswahlrahmen wählen mehrere Elemente, der
 * gemeinsame Transformer zieht sie zusammen, und jedes schreibt seine neue
 * Position über seinen eigenen `dragend` zurück.
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
import { findDragNodes, isGroupDrag } from '../../utils/multiSelect';
import { createShape, type ShapeInstance } from '../../utils/shapes';
import { useCanvasInteractions } from '../useCanvasInteractions';

import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore';

// Mittelpunkt-verankert; die jsdom-Leinwand misst 300×150.
const box = (id: string, x: number, y: number): ShapeInstance => ({
  ...createShape('rect', x, y, '#888888', '#888888'),
  id,
  width: 80,
  height: 50,
});
// a: 10–90 × 15–65, b: 160–240 × 15–65, c: 160–240 × 90–140
const SHAPES = [box('a', 50, 40), box('b', 200, 40), box('c', 200, 115)];

function Host({
  stageRef,
  storeRef,
  onChange,
}: {
  stageRef: React.RefObject<CanvasStageRef | null>;
  storeRef: { current: CanvasEditorStoreApi | null };
  onChange: (id: string, attrs: Partial<ShapeInstance>) => void;
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
          <ShapePrimitive
            shape={shape}
            isSelected={selected === shape.id}
            onSelect={selectElement}
            onChange={(attrs) => onChange(shape.id, attrs)}
          />
        </Group>
      ))}
      <MultiSelectionTransformer renderKey={SHAPES} />
    </CanvasStage>
  );
}

function mount() {
  const stageRef = createRef<CanvasStageRef>();
  const storeRef: { current: CanvasEditorStoreApi | null } = { current: null };
  const changes: Array<[string, Partial<ShapeInstance>]> = [];
  render(
    <CanvasStoreProvider>
      <Host
        stageRef={stageRef}
        storeRef={storeRef}
        onChange={(id, attrs) => changes.push([id, attrs])}
      />
    </CanvasStoreProvider>
  );
  const stage = stageRef.current!.getStage()!;
  act(() => {
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
      // Wie im Browser: erst das Pointer-, dann das Maus-Ereignis.
      const pointerType = type.replace('mouse', 'pointer');
      target.dispatchEvent(new MouseEvent(pointerType, init));
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
  const state = () => storeRef.current!.getState();
  return { stage, state, click, drag, fire, changes, store: storeRef };
}

describe('Mehrfachauswahl', () => {
  it('Shift-Klick sammelt Elemente; der gemeinsame Transformer umfasst sie', () => {
    const { stage, state, click } = mount();
    click(50, 40);
    click(200, 40, true);
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
    expect(state().selectedElement).toBeNull();
    const [nodeA] = findDragNodes(stage, ['a']);
    expect(isGroupDrag(nodeA!)).toBe(true);
  });

  it('Ziehen eines Elements bewegt die ganze Auswahl, jedes schreibt zurück', () => {
    const { stage, state, click, drag, changes } = mount();
    click(50, 40);
    click(200, 40, true);
    drag(50, 40, 30, 20);
    const moved = Object.fromEntries(changes);
    expect(Object.keys(moved).sort()).toEqual(['a', 'b']);
    expect(moved.a).toMatchObject({ x: 80, y: 60 });
    expect(moved.b).toMatchObject({ x: 230, y: 60 });
    // Je Element ein Umriss, der dem Zug gefolgt ist.
    const outlineXs = stage
      .find('.selection-chrome')
      .filter((node) => node.visible())
      .map((node) => Math.round(node.x()))
      .sort((p, q) => p - q);
    expect(outlineXs).toEqual([40, 190]);
    // Ein Zug klappt die Auswahl nicht zusammen.
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
  });

  it('Klick ohne Ziehen auf ein Element der Auswahl klappt auf dieses zusammen', () => {
    const { state, click } = mount();
    click(50, 40);
    click(200, 40, true);
    click(200, 40);
    expect(state().selectedLayerIds).toEqual(['b']);
    expect(state().selectedElement).toBe('b');
  });

  it('Auswahlrahmen auf leerer Fläche wählt jedes geschnittene Element', () => {
    const { state, drag } = mount();
    drag(5, 5, 245, 70);
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
  });

  it('der Rahmen zeigt seine Treffer schon während des Zugs, ohne den Store anzufassen', () => {
    const { stage, state, fire, store } = mount();
    let writes = 0;
    const unsubscribe = store.current!.subscribe(() => {
      writes += 1;
    });
    fire(stage.content, 'mousedown', 5, 5, false);
    for (let step = 1; step <= 4; step++)
      fire(window, 'mousemove', 5 + 60 * step, 5 + 17 * step, false);
    const outlines = stage
      .find('.selection-chrome')
      .filter((node) => node.visible() && node.getAttr('fill') === undefined);
    expect(outlines).toHaveLength(2);
    expect(writes).toBe(0);
    fire(window, 'mouseup', 245, 73, false);
    unsubscribe();
    expect(state().selectedLayerIds).toEqual(['a', 'b']);
    // Der Rahmen ist weg; die Auswahl trägt ihre zwei Element-Umrisse.
    const visible = stage.find('.selection-chrome').filter((node) => node.visible());
    expect(visible.filter((node) => node.getAttr('fill') !== undefined)).toHaveLength(0);
    expect(visible).toHaveLength(2);
  });

  it('Shift-Rahmen ergänzt die bestehende Auswahl', () => {
    const { state, click, drag } = mount();
    click(50, 40);
    drag(150, 145, 95, -20, true);
    expect(state().selectedLayerIds).toEqual(['a', 'c']);
  });

  it('ein Klick auf leere Fläche hebt die Auswahl auf', () => {
    const { state, click } = mount();
    click(50, 40);
    click(200, 40, true);
    click(120, 100);
    expect(state().selectedLayerIds).toEqual([]);
  });
});

/**
 * Ctrl/⌘-click selects what lies beneath (Canva). The case it is for: an AT
 * sharepic strip, where the green tint covers the background photo exactly,
 * so a plain click can only ever reach the tint.
 */
import { useDeepSelect } from '@ggraphic/editor/hooks/useDeepSelect';
import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { ShapePrimitive } from '@ggraphic/editor/primitives/ShapePrimitive';
import {
  CanvasStoreProvider,
  useCanvasStore,
  useCanvasStoreSelector,
} from '@ggraphic/editor/stores/CanvasStoreProvider';
import { nextDeepTarget } from '@ggraphic/editor/utils/deepSelect';
import { createShape, type ShapeInstance } from '@ggraphic/editor/utils/shapes';
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { Group } from 'react-konva';
import { describe, expect, it } from 'vitest';

import type { CanvasEditorStoreApi } from '@ggraphic/editor/stores/createCanvasEditorStore';

// 280×140 at the origin: the jsdom canvas keeps the default 300×150 backing size.
const sheet = (id: string, extra: Partial<ShapeInstance> = {}): ShapeInstance => ({
  ...createShape('rect', 140, 70, '#888888', '#888888'),
  id,
  width: 280,
  height: 140,
  ...extra,
});

/** Stable, so the effect is not re-run on every render. */
const notMac = () => false;

function Host({
  stageRef,
  storeRef,
  shapes,
  onChange,
}: {
  stageRef: React.RefObject<CanvasStageRef | null>;
  storeRef: { current: CanvasEditorStoreApi | null };
  shapes: ShapeInstance[];
  onChange: (id: string, attrs: Partial<ShapeInstance>) => void;
}) {
  const store = useCanvasStore();
  storeRef.current = store;
  const selected = useCanvasStoreSelector((s) => s.selectedElement);
  useDeepSelect(stageRef, true, notMac);
  return (
    <CanvasStage ref={stageRef} width={300} height={150} responsive={false}>
      {shapes.map((shape) => (
        <Group key={shape.id} name="canvas-item" canvasItemId={shape.id}>
          <ShapePrimitive
            shape={shape}
            isSelected={selected === shape.id}
            onSelect={(id) => store.getState().setSelectedElement(id)}
            onChange={(attrs) => onChange(shape.id, attrs)}
          />
        </Group>
      ))}
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
        shapes={[sheet('photo'), sheet('tint', { blendMode: 'color' })]}
        onChange={(id, attrs) => changes.push([id, attrs])}
      />
    </CanvasStoreProvider>
  );
  const stage = stageRef.current!.getStage()!;
  act(() => {
    stage.draw();
  });
  const selected = () => storeRef.current!.getState().selectedElement;
  const mouse = (target: EventTarget, type: string, x: number, ctrl = false) =>
    act(() => {
      target.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: x,
          clientY: 70,
          ctrlKey: ctrl,
        })
      );
    });
  const click = (x: number, ctrl = false) => {
    mouse(stage.content, 'mousedown', x, ctrl);
    mouse(window, 'mouseup', x, ctrl);
  };
  const drag = (x: number, dx: number) => {
    mouse(stage.content, 'mousedown', x);
    for (let step = 1; step <= 4; step++) mouse(window, 'mousemove', x + (dx * step) / 4);
    mouse(window, 'mouseup', x + dx);
  };
  return { selected, click, drag, changes };
}

describe('nextDeepTarget', () => {
  const stack = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  it('steps one below the selection and wraps round', () => {
    expect(nextDeepTarget(stack, null)?.id).toBe('b');
    expect(nextDeepTarget(stack, 'a')?.id).toBe('b');
    expect(nextDeepTarget(stack, 'b')?.id).toBe('c');
    expect(nextDeepTarget(stack, 'c')?.id).toBe('a');
    expect(nextDeepTarget(stack, 'elsewhere')?.id).toBe('b');
    expect(nextDeepTarget([{ id: 'a' }], null)?.id).toBe('a');
    expect(nextDeepTarget([], null)).toBeNull();
  });
});

describe('useDeepSelect', () => {
  it('a plain click selects the top item, as before', () => {
    const { selected, click } = mount();
    click(100);
    expect(selected()).toBe('tint');
  });

  it('ctrl-click selects the photo under the tint, the next one wraps round', () => {
    const { selected, click } = mount();
    click(100, true);
    expect(selected()).toBe('photo');
    click(100, true);
    expect(selected()).toBe('tint');
  });

  it('after a ctrl-click a plain drag moves the photo, not the tint', () => {
    const { selected, click, drag, changes } = mount();
    click(100, true);
    drag(100, 60);
    expect(changes.map(([id]) => id)).toEqual(['photo']);
    expect(selected()).toBe('photo');
  });

  it('a claimed press still reaches the page, so popovers close as on any click outside', () => {
    const { click, drag } = mount();
    let heard = 0;
    const onDocument = () => {
      heard += 1;
    };
    document.addEventListener('mousedown', onDocument);
    click(100, true); // ctrl-click: claimed from Konva
    drag(100, 20); // plain drag on the covered selection: claimed too
    document.removeEventListener('mousedown', onDocument);
    expect(heard).toBe(2);
  });

  it('after a ctrl-click a plain click without moving goes back to the top', () => {
    const { selected, click } = mount();
    click(100, true);
    click(100);
    expect(selected()).toBe('tint');
  });
});

import { render, act } from '@testing-library/react';
import { createRef, useState } from 'react';
import { Rect, Transformer } from 'react-konva';
import { describe, expect, it, vi } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage';

import type Konva from 'konva';

let selected: string | null = null;

function Scene({ onDragEnd }: { onDragEnd: (x: number) => void }) {
  const [, setSel] = useState<string | null>(null);
  const select = (id: string) => () => {
    selected = id;
    setSel(id);
  };
  return (
    <>
      <Rect
        id="a"
        x={0}
        y={0}
        width={100}
        height={100}
        fill="red"
        draggable
        onTouchStart={select('a')}
        onDragEnd={(e) => onDragEnd(e.target.x())}
      />
      <Rect
        id="b"
        x={200}
        y={0}
        width={100}
        height={100}
        fill="blue"
        draggable
        onTouchStart={select('b')}
      />
    </>
  );
}

function setup() {
  selected = null;
  const onDragEnd = vi.fn();
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={300} height={300} responsive={false}>
      <Scene onDragEnd={onDragEnd} />
    </CanvasStage>
  );
  const stage = stageRef.current!.getStage()!;
  act(() => {
    stage.draw();
  });
  return { stage, onDragEnd, rectA: stage.findOne<Konva.Rect>('#a')! };
}

type Point = { identifier: number; clientX: number; clientY: number };

function fireTouch(stage: Konva.Stage, type: string, touches: Point[], changed: Point[]) {
  const content = stage.content;
  const evt = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    touches: unknown[];
    changedTouches: unknown[];
  };
  evt.touches = touches.map((t) => ({ ...t, target: content }));
  evt.changedTouches = changed.map((t) => ({ ...t, target: content }));
  (type === 'touchstart' ? content : window).dispatchEvent(evt);
}

function pinch(stage: Konva.Stage, firstFingerMove: number) {
  let f1: Point = { identifier: 1, clientX: 50, clientY: 50 };
  let f2: Point = { identifier: 2, clientX: 250, clientY: 50 };
  act(() => {
    fireTouch(stage, 'touchstart', [f1], [f1]);
    if (firstFingerMove) {
      f1 = { ...f1, clientX: 50 + firstFingerMove };
      fireTouch(stage, 'touchmove', [f1], [f1]);
    }
    fireTouch(stage, 'touchstart', [f1, f2], [f2]);
    f1 = { ...f1, clientX: f1.clientX - 40 };
    f2 = { ...f2, clientX: f2.clientX + 40 };
    fireTouch(stage, 'touchmove', [f1, f2], [f1, f2]);
    fireTouch(stage, 'touchend', [f2], [f1]);
    fireTouch(stage, 'touchend', [], [f2]);
  });
}

describe('Pinch über zwei Elementen', () => {
  it('der zweite Finger wählt nichts aus und nichts bewegt sich', () => {
    const { stage, rectA, onDragEnd } = setup();
    pinch(stage, 0);
    expect(selected).toBe('a');
    expect(rectA.x()).toBe(0);
    expect(onDragEnd).not.toHaveBeenCalled();
  });

  it('ein schon begonnener Drag springt zurück und meldet die Ausgangslage', () => {
    const { stage, rectA, onDragEnd } = setup();
    pinch(stage, 20);
    expect(selected).toBe('a');
    expect(rectA.x()).toBe(0);
    expect(onDragEnd).toHaveBeenCalledTimes(1);
    expect(onDragEnd).toHaveBeenCalledWith(0);
  });

  it('ein einzelner Finger zieht weiterhin', () => {
    const { stage, rectA } = setup();
    const f: Point = { identifier: 1, clientX: 50, clientY: 50 };
    act(() => {
      fireTouch(stage, 'touchstart', [f], [f]);
      fireTouch(stage, 'touchmove', [{ ...f, clientX: 70 }], [{ ...f, clientX: 70 }]);
      fireTouch(stage, 'touchend', [], [{ ...f, clientX: 70 }]);
    });
    expect(rectA.x()).toBe(20);
  });
});

describe('Pinch während einer Größenänderung', () => {
  it('setzt das Element zurück und beendet die Transformation genau einmal', () => {
    const stageRef = createRef<CanvasStageRef>();
    const rectRef = createRef<Konva.Rect>();
    const trRef = createRef<Konva.Transformer>();
    const onTransformEnd = vi.fn();
    render(
      <CanvasStage ref={stageRef} width={300} height={300} responsive={false}>
        <Rect
          ref={rectRef}
          x={0}
          y={0}
          width={100}
          height={100}
          fill="red"
          onTransformEnd={(e) => {
            onTransformEnd(e.target.scaleX());
          }}
        />
        <Transformer ref={trRef} />
      </CanvasStage>
    );
    const stage = stageRef.current!.getStage()!;
    const rect = rectRef.current!;
    act(() => {
      trRef.current!.nodes([rect]);
      stage.draw();
    });

    let f1: Point = { identifier: 1, clientX: 100, clientY: 100 };
    let f2: Point = { identifier: 2, clientX: 250, clientY: 250 };
    act(() => {
      fireTouch(stage, 'touchstart', [f1], [f1]);
      f1 = { ...f1, clientX: 140, clientY: 140 };
      fireTouch(stage, 'touchmove', [f1], [f1]);
    });
    expect(rect.scaleX()).not.toBe(1);

    act(() => {
      fireTouch(stage, 'touchstart', [f1, f2], [f2]);
      f1 = { ...f1, clientX: 180, clientY: 180 };
      f2 = { ...f2, clientX: 290, clientY: 290 };
      fireTouch(stage, 'touchmove', [f1, f2], [f1, f2]);
      fireTouch(stage, 'touchend', [f2], [f1]);
      fireTouch(stage, 'touchend', [], [f2]);
    });

    expect(trRef.current!.isTransforming()).toBe(false);
    expect(rect.scaleX()).toBe(1);
    expect(rect.scaleY()).toBe(1);
    expect(rect.position()).toEqual({ x: 0, y: 0 });
    expect(onTransformEnd).toHaveBeenCalledTimes(1);
    expect(onTransformEnd).toHaveBeenCalledWith(1);
  });
});

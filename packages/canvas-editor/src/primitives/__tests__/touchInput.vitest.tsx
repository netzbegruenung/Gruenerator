import { render, act } from '@testing-library/react';
import { createRef } from 'react';
import { Rect, Transformer } from 'react-konva';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage';

import type Konva from 'konva';

function setup() {
  const stageRef = createRef<CanvasStageRef>();
  const rectRef = createRef<Konva.Rect>();
  render(
    <CanvasStage ref={stageRef} width={300} height={300} responsive={false}>
      <Rect ref={rectRef} x={0} y={0} width={100} height={100} fill="red" draggable />
    </CanvasStage>
  );
  const stage = stageRef.current!.getStage()!;
  act(() => {
    stage.draw();
  });
  return { stage, rect: rectRef.current! };
}

function touchDrag(stage: Konva.Stage, dx: number) {
  const content = stage.content;
  const touch = (type: string, x: number) => {
    const t = { identifier: 1, clientX: x, clientY: 50, target: content };
    const evt = new Event(type, { bubbles: true, cancelable: true }) as Event & {
      touches: unknown[];
      changedTouches: unknown[];
    };
    const active = type === 'touchend' ? [] : [t];
    evt.touches = active;
    evt.changedTouches = [t];
    (type === 'touchmove' || type === 'touchend' ? window : content).dispatchEvent(evt);
  };
  act(() => {
    touch('touchstart', 50);
    touch('touchmove', 50 + dx);
    touch('touchend', 50 + dx);
  });
}

function mouseDrag(stage: Konva.Stage, dx: number) {
  const fire = (target: EventTarget, type: string, x: number) =>
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: 50 })
    );
  act(() => {
    fire(stage.content, 'mousedown', 50);
    fire(window, 'mousemove', 50 + dx);
    fire(window, 'mouseup', 50 + dx);
  });
}

describe('Drag-Schwelle nach Zeigerart', () => {
  it('Touch unter 8 px verschiebt nichts, darüber schon', () => {
    const { stage, rect } = setup();
    touchDrag(stage, 6);
    expect(rect.x()).toBe(0);
    touchDrag(stage, 12);
    expect(rect.x()).not.toBe(0);
  });

  it('Maus bewegt schon ab 4 px', () => {
    const { stage, rect } = setup();
    touchDrag(stage, 2);
    mouseDrag(stage, 4);
    expect(rect.x()).not.toBe(0);
  });
});

describe('Transformer-Anker auf Touch-Geräten', () => {
  afterEach(() => vi.unstubAllGlobals());

  const hitStrokeFor = async (coarse: boolean) => {
    vi.resetModules();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: coarse && q === '(pointer: coarse)' }));
    const { touchAnchorStyleFunc } = await import('../../utils/touchInput');
    const stageRef = createRef<CanvasStageRef>();
    const rectRef = createRef<Konva.Rect>();
    const trRef = createRef<Konva.Transformer>();
    render(
      <CanvasStage ref={stageRef} width={300} height={300} responsive={false}>
        <Rect ref={rectRef} x={50} y={50} width={100} height={100} fill="red" />
        <Transformer ref={trRef} nodes={[]} anchorStyleFunc={touchAnchorStyleFunc} />
      </CanvasStage>
    );
    act(() => {
      trRef.current!.nodes([rectRef.current!]);
      stageRef.current!.getStage()!.draw();
    });
    const anchor = trRef.current!.findOne<Konva.Rect>('.top-left')!;
    return { size: anchor.width(), hit: anchor.hitStrokeWidth(), func: touchAnchorStyleFunc };
  };

  it('setzt auf Touch-Geräten 34 px Trefferfläche, die sichtbare Größe bleibt', async () => {
    const coarse = await hitStrokeFor(true);
    const fine = await hitStrokeFor(false);
    expect(coarse.func).toBeTypeOf('function');
    expect(coarse.size).toBe(fine.size);
    expect(coarse.hit).toBe(34);
  });

  it('übergibt bei feinem Zeiger keine Funktion und behält Konvas Standard', async () => {
    const fine = await hitStrokeFor(false);
    expect(fine.func).toBeUndefined();
    expect(fine.hit).not.toBe(34);
  });
});

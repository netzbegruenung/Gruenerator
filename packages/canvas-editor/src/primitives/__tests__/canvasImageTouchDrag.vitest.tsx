import { createCanvas } from '@napi-rs/canvas';
import { render, act } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CanvasImage } from '../CanvasImage';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage';

beforeEach(() => {
  vi.spyOn(Konva.Image.prototype, 'cache').mockReturnThis();
});

function setup(selected: boolean) {
  const stageRef = createRef<CanvasStageRef>();
  const image = Object.assign(createCanvas(300, 300), {
    naturalWidth: 300,
    naturalHeight: 300,
  }) as unknown as HTMLImageElement;
  const onSelect = () => {};
  const ui = (sel: boolean) => (
    <CanvasStage ref={stageRef} width={300} height={300} responsive={false}>
      <CanvasImage
        id="background-image"
        image={image}
        x={0}
        y={0}
        width={100}
        height={100}
        selected={sel}
        touchDragNeedsSelection
        constrainToBounds={false}
        snapToCenter={false}
        onSelect={onSelect}
      />
    </CanvasStage>
  );
  const view = render(ui(selected));
  const stage = stageRef.current!.getStage()!;
  act(() => {
    stage.draw();
  });
  const node = () => stage.findOne('#background-image') as Konva.Image;
  return { stage, node, rerender: (sel: boolean) => view.rerender(ui(sel)) };
}

function touchDrag(stage: Konva.Stage, dx: number) {
  const content = stage.content;
  const touch = (type: string, x: number) => {
    const t = { identifier: 1, clientX: x, clientY: 50, target: content };
    const evt = new Event(type, { bubbles: true, cancelable: true }) as Event & {
      touches: unknown[];
      changedTouches: unknown[];
    };
    evt.touches = type === 'touchend' ? [] : [t];
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

describe('Hintergrundbild: Touch-Drag nur im ausgewaehlten Zustand', () => {
  it('Wischen ueber das nicht ausgewaehlte Bild verschiebt es nicht', () => {
    const { stage, node } = setup(false);
    touchDrag(stage, 40);
    expect(node().x()).toBe(0);
  });

  it('ist nach dem Auswaehlen per Touch verschiebbar', () => {
    const { stage, node, rerender } = setup(false);
    touchDrag(stage, 40);
    rerender(true);
    touchDrag(stage, 40);
    expect(node().x()).not.toBe(0);
  });

  it('Maus verschiebt auch das nicht ausgewaehlte Bild', () => {
    const { stage, node } = setup(false);
    mouseDrag(stage, 40);
    expect(node().x()).not.toBe(0);
  });
});

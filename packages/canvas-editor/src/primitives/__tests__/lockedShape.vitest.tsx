import { render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { createShape, type ShapeInstance } from '../../utils/shapes';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage';
import { ShapePrimitive } from '../ShapePrimitive';

function rectNode(shape: ShapeInstance) {
  Konva.autoDrawEnabled = false;
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={600} height={600}>
      <ShapePrimitive shape={shape} isSelected={false} onSelect={() => {}} onChange={() => {}} />
    </CanvasStage>
  );
  const stage = stageRef.current!.getStage()!;
  return stage.findOne(`.shape-${shape.id}`)!;
}

const plane = (id: string, locked?: boolean): ShapeInstance => {
  const shape = { ...createShape('rect', 300, 300, '#005538', '#005538'), id };
  if (locked !== undefined) shape.locked = locked;
  return shape;
};

describe('locked shapes', () => {
  it('a locked plane is drawn but neither hit-tested nor draggable', () => {
    const node = rectNode(plane('sc-bg', true));
    expect(node.listening()).toBe(false);
    expect(node.draggable()).toBe(false);
  });

  it('a composer plane from an older canvas (no flag) is locked by its id', () => {
    const node = rectNode(plane('sc-scrim'));
    expect(node.listening()).toBe(false);
  });

  it('an ordinary shape stays selectable and draggable', () => {
    const node = rectNode(plane('shape-1'));
    expect(node.listening()).toBe(true);
    expect(node.draggable()).toBe(true);
  });
});

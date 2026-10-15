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

const plane = (id: string): ShapeInstance => ({
  ...createShape('rect', 300, 300, '#005538', '#005538'),
  id,
});

describe('composer planes in the editor', () => {
  it('a plane saved with the old `locked: true` is selectable and draggable', () => {
    // Canvases composed 07.–15.10.2026 carry the flag; nothing reads it any more.
    const node = rectNode({ ...plane('sc-panel'), locked: true } as ShapeInstance);
    expect(node.listening()).toBe(true);
    expect(node.draggable()).toBe(true);
  });

  it('a plane from before the flag, known only by its id, is too', () => {
    const node = rectNode(plane('sc-scrim'));
    expect(node.listening()).toBe(true);
    expect(node.draggable()).toBe(true);
  });
});

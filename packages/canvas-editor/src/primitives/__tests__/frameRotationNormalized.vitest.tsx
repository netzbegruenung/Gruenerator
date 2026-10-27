/**
 * Der Rahmen speichert seine Drehung wie jedes andere Element in (−180, 180]
 * — auch wenn eine Gruppendrehung den Knoten über ±180° hinaus dreht.
 */
import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { FramePrimitive } from '@ggraphic/editor/primitives/FramePrimitive';
import { createFrameInstance } from '@ggraphic/editor/utils/frameUtils';
import { render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

describe('FramePrimitive', () => {
  it('normalises a rotation past 180° on transform end', () => {
    const onChange = vi.fn();
    const frame = { ...createFrameInstance('square', 100, 100), id: 'f' };
    const stageRef = createRef<CanvasStageRef>();
    render(
      <CanvasStage ref={stageRef} width={600} height={600} responsive={false}>
        <FramePrimitive
          frame={frame}
          isSelected={false}
          onSelect={() => {}}
          onChange={onChange}
          onImageUpload={() => {}}
        />
      </CanvasStage>
    );
    const node = stageRef.current!.getStage()!.findOne('.frame-f')!;

    node.rotation(270);
    node.fire('transformend');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toMatchObject({ rotation: -90 });
  });
});

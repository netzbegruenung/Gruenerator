import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { createShape, type ShapeInstance } from '../../utils/shapes';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage';
import { ShapePrimitive } from '../ShapePrimitive';

/**
 * A 280×140 rect at the origin: the jsdom canvas (`vitest.setup.ts`) keeps the
 * default 300×150 backing size, so hits are read inside that.
 */
const sheet = (id: string, extra: Partial<ShapeInstance> = {}): ShapeInstance => ({
  ...createShape('rect', 140, 70, '#005538', '#005538'),
  id,
  width: 280,
  height: 140,
  ...extra,
});

/** What Konva finds under a point: the real path of a click. */
function hitsOver(top: ShapeInstance) {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={600} height={600}>
      <ShapePrimitive
        shape={sheet('photo')}
        isSelected={false}
        onSelect={() => {}}
        onChange={() => {}}
      />
      <ShapePrimitive shape={top} isSelected={false} onSelect={() => {}} onChange={() => {}} />
    </CanvasStage>
  );
  const stage = stageRef.current!.getStage()!;
  act(() => {
    stage.draw();
  });
  return (x: number, y: number) => stage.getIntersection({ x, y })?.name() ?? null;
}

describe('hit area of a shape over another', () => {
  it('a scrim answers where it darkens and lets the clear part through', () => {
    const hit = hitsOver(
      sheet('sc-scrim', {
        fill: 'transparent',
        fillGradient: {
          type: 'linear',
          angle: 0,
          stops: [
            { offset: 0, color: 'rgba(0,38,26,0)' },
            { offset: 0.5, color: 'rgba(0,38,26,0.2)' },
            { offset: 1, color: 'rgba(0,38,26,0.5)' },
          ],
        },
      })
    );
    expect(hit(20, 70)).toBe('shape-photo');
    expect(hit(260, 70)).toBe('shape-sc-scrim');
  });

  it('an opaque plane answers everywhere', () => {
    const hit = hitsOver(sheet('sc-panel'));
    expect(hit(20, 70)).toBe('shape-sc-panel');
    expect(hit(260, 70)).toBe('shape-sc-panel');
  });

  it('a colour tint answers everywhere: its fill is opaque, only its blend is not', () => {
    const hit = hitsOver(sheet('sc-tint', { blendMode: 'color' }));
    expect(hit(20, 70)).toBe('shape-sc-tint');
  });
});

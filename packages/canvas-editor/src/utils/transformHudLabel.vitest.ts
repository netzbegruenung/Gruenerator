import { type NodeFrame } from '@ggraphic/editor/utils/orientation';
import { transformHudLabel } from '@ggraphic/editor/utils/transformHudLabel';
import { describe, expect, it } from 'vitest';

const frame = (over: Partial<NodeFrame> = {}): NodeFrame => ({
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  local: { x: 0, y: 0, width: 100, height: 50 },
  ...over,
});

describe('transformHudLabel', () => {
  it('shows the rounded angle while rotating', () => {
    expect(transformHudLabel('rotater', frame({ rotation: 44.6 }), 1)).toBe('45°');
  });

  it('normalises the angle to (-180, 180]', () => {
    expect(transformHudLabel('rotater', frame({ rotation: 190 }), 1)).toBe('-170°');
  });

  it('shows the size in logical px while resizing', () => {
    const f = frame({ scaleX: 0.5, scaleY: 0.5, local: { x: 0, y: 0, width: 640, height: 360 } });
    expect(transformHudLabel('bottom-right', f, 1)).toBe('320 × 180');
  });

  it('divides by the logical scale', () => {
    const f = frame({ local: { x: 0, y: 0, width: 640, height: 360 } });
    expect(transformHudLabel('top-left', f, 2)).toBe('320 × 180');
  });

  it('returns null without an active anchor', () => {
    expect(transformHudLabel(null, frame(), 1)).toBeNull();
  });
});

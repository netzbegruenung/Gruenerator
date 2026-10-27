// SPDX-License-Identifier: MPL-2.0
import { render } from '@testing-library/react';
import Konva from 'konva';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TransformHud } from '@ggraphic/editor/components/TransformHud';

// Konva's Transformer fires `transform` / `transformend` on itself without
// bubbling; the HUD must listen there, not on the stage.
function setup(nodes: 1 | 2 = 1, groupScale = 1) {
  const div = document.createElement('div');
  document.body.appendChild(div);
  const stage = new Konva.Stage({
    container: div,
    width: 500,
    height: 500,
    scaleX: 0.5,
    scaleY: 0.5,
  });
  const layer = new Konva.Layer();
  stage.add(layer);
  const group = new Konva.Group({ scaleX: groupScale, scaleY: groupScale });
  layer.add(group);
  const a = new Konva.Rect({ x: 0, y: 0, width: 640, height: 360, draggable: true });
  const b = new Konva.Rect({ x: 640, y: 360, width: 100, height: 100, draggable: true });
  group.add(a);
  if (nodes === 2) group.add(b);
  const tr = new Konva.Transformer({ nodes: nodes === 2 ? [a, b] : [a] });
  layer.add(tr);
  const ref = { current: stage };
  const view = render(<TransformHud stageRef={ref} enabled />);
  const badge = view.container.firstElementChild as HTMLElement;
  return { stage, tr, a, badge };
}

const fire = (tr: Konva.Transformer, type: string) =>
  (tr as unknown as { _fire: (t: string, e: object) => void })._fire(type, {});

describe('TransformHud', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) =>
      setTimeout(() => cb(0), 0)
    );
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('shows the angle while rotating and hides on end', async () => {
    const { stage, tr, a, badge } = setup();
    stage.container().dispatchEvent(new Event('pointerdown'));
    (tr as unknown as { _movingAnchorName: string })._movingAnchorName = 'rotater';
    a.rotation(44.6);
    fire(tr, 'transform');
    await vi.waitFor(() => expect(badge.textContent).toBe('45°'));
    expect(badge.style.display).toBe('block');
    fire(tr, 'transformend');
    expect(badge.style.display).toBe('none');
  });

  it('puts the angle next to the pointer while rotating', async () => {
    const { stage, tr, badge } = setup();
    stage.container().dispatchEvent(new Event('pointerdown'));
    (tr as unknown as { _movingAnchorName: string })._movingAnchorName = 'rotater';
    vi.spyOn(stage, 'getPointerPosition').mockReturnValue({ x: 100, y: 80 });
    fire(tr, 'transform');
    await vi.waitFor(() => expect(badge.style.display).toBe('block'));
    // GAP 12 container px; the stage is 500 wide in an unsized host, css = 1.
    expect(badge.style.transform).toMatch(/^translate\(112px, 92px\)/);
  });

  it('shows logical size for a multi-selection under a scaled group', async () => {
    const { stage, tr, badge } = setup(2, 2);
    stage.container().dispatchEvent(new Event('pointerdown'));
    (tr as unknown as { _movingAnchorName: string })._movingAnchorName = 'bottom-right';
    fire(tr, 'transform');
    // Union of both rects is 740 x 460 logical px.
    await vi.waitFor(() => expect(badge.textContent).toBe('740 × 460'));
  });
});

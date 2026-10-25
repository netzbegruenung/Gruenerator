import { act, render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { createShape, type ShapeInstance } from '../../utils/shapes';
import { AssetPrimitive } from '../AssetPrimitive';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage';
import { IconPrimitive } from '../IconPrimitive';
import { IllustrationPrimitive } from '../IllustrationPrimitive';
import { ShapePrimitive } from '../ShapePrimitive';

vi.mock('../../utils/canvasIcons', () => ({
  generateIconDataUrl: vi.fn(() => Promise.resolve('data:image/png;base64,AA==')),
}));
vi.mock('../../utils/illustrations/registry', () => ({
  findIllustrationById: vi.fn(() =>
    Promise.resolve({ id: 'ill', name: 'ill', filename: 'ill.svg', source: 'undraw', tags: [] })
  ),
  getIllustrationPath: vi.fn(() => '/ill.svg'),
}));
vi.mock('../../utils/illustrations/svgCache', () => ({
  getCachedSVG: vi.fn(() => 'data:image/png;base64,AA=='),
  getSVG: vi.fn(() => Promise.resolve('data:image/png;base64,AA==')),
}));

beforeAll(() => {
  Konva.autoDrawEnabled = false;
  // The fake image is not drawable on Konva's node canvas; geometry is all these tests read.
  vi.spyOn(Konva.Image.prototype, 'drawScene').mockImplementation(function (this: Konva.Image) {
    return this;
  });
  // jsdom never loads images; fire onload so the primitives leave their null state.
  function FakeImage() {
    const img = document.createElement('canvas');
    img.width = 100;
    img.height = 100;
    Object.defineProperty(img, 'naturalWidth', { value: 100 });
    Object.defineProperty(img, 'naturalHeight', { value: 100 });
    Object.defineProperty(img, 'src', {
      set() {
        queueMicrotask(() => (img as unknown as { onload?: () => void }).onload?.());
      },
    });
    return img;
  }
  vi.stubGlobal('Image', FakeImage);
  window.Image = FakeImage as unknown as typeof window.Image;
});

async function mount(ui: React.ReactElement, name: string) {
  const stageRef = createRef<CanvasStageRef>();
  await act(async () => {
    render(
      <CanvasStage ref={stageRef} width={600} height={600}>
        {ui}
      </CanvasStage>
    );
    await new Promise((r) => setTimeout(r, 0));
  });
  const stage = stageRef.current!.getStage()!;
  return stage.findOne(name) ?? stage.findOne('Group')!;
}

const noop = () => {};

describe('icon flip', () => {
  const icon = (flipX?: boolean, flipY?: boolean, onTransformEnd = vi.fn()) => (
    <IconPrimitive
      id="i"
      icon="x"
      x={100}
      y={100}
      scale={2}
      rotation={0}
      flipX={flipX}
      flipY={flipY}
      selected={false}
      onSelect={noop}
      onDragEnd={noop}
      onTransformEnd={onTransformEnd}
    />
  );

  it('draws a mirrored node with the same magnitude', async () => {
    const plain = await mount(icon(), 'Group');
    const flipped = await mount(icon(true), 'Group');
    expect(flipped.scaleX()).toBeLessThan(0);
    expect(Math.abs(flipped.scaleX())).toBeCloseTo(plain.scaleX());
    expect(flipped.scaleY()).toBeCloseTo(plain.scaleY());
  });

  it('leaves unflipped nodes unchanged', async () => {
    const node = await mount(icon(), 'Group');
    expect(node.scaleX()).toBeGreaterThan(0);
    expect(node.scaleY()).toBeGreaterThan(0);
    expect(node.scaleX()).toBeCloseTo(node.scaleY());
  });

  it('reports a positive scale after a resize and keeps the mirror', async () => {
    const onTransformEnd = vi.fn();
    const node = await mount(icon(true, false, onTransformEnd), 'Group');
    const base = Math.abs(node.scaleX()) / 2;
    node.scaleX(-4 * base);
    node.scaleY(4 * base);
    node.fire('transformend');
    expect(onTransformEnd).toHaveBeenCalledTimes(1);
    expect(onTransformEnd.mock.calls[0][2]).toBeCloseTo(4);
    expect(node.scaleX()).toBeCloseTo(-2 * base);
    expect(node.scaleY()).toBeCloseTo(2 * base);
  });
});

describe('illustration flip', () => {
  const ill = (flipY: boolean, onTransformEnd = vi.fn()) => (
    <IllustrationPrimitive
      illustration={{
        id: 'il',
        illustrationId: 'ill',
        source: 'undraw',
        x: 50,
        y: 50,
        scale: 2,
        rotation: 0,
        opacity: 1,
        flipY,
      }}
      isSelected={false}
      onSelect={noop}
      onDragEnd={noop}
      onTransformEnd={onTransformEnd}
    />
  );

  it('mirrors and keeps the sign through a resize', async () => {
    const onTransformEnd = vi.fn();
    const node = await mount(ill(true, onTransformEnd), 'Group');
    expect(node.scaleY()).toBeLessThan(0);
    const base = Math.abs(node.scaleY()) / 2;
    node.scaleX(3 * base);
    node.scaleY(-3 * base);
    node.fire('transformend');
    expect(onTransformEnd.mock.calls[0][2]).toBeCloseTo(3);
    expect(node.scaleY()).toBeCloseTo(-2 * base);
    expect(node.scaleX()).toBeCloseTo(2 * base);
  });
});

describe('asset flip', () => {
  it('mirrors and keeps the sign through a resize', async () => {
    const onTransformEnd = vi.fn();
    const node = await mount(
      <AssetPrimitive
        asset={{
          id: 'a',
          assetId: 'gruene-de-logo',
          x: 10,
          y: 10,
          scale: 2,
          rotation: 0,
          opacity: 1,
          flipX: true,
        }}
        isSelected={false}
        onSelect={noop}
        onDragEnd={noop}
        onTransformEnd={onTransformEnd}
      />,
      'Group'
    );
    expect(node.scaleX()).toBe(-2);
    node.scaleX(-3);
    node.scaleY(3);
    node.fire('transformend');
    expect(onTransformEnd.mock.calls[0][2]).toBe(3);
    expect(node.scaleX()).toBe(-2);
    expect(node.scaleY()).toBe(2);
  });
});

describe('shape flip', () => {
  const shapeNode = async (shape: ShapeInstance, onChange = vi.fn()) =>
    mount(
      <ShapePrimitive shape={shape} isSelected={false} onSelect={noop} onChange={onChange} />,
      `.shape-${shape.id}`
    );

  it('keeps width/height positive after resizing a flipped rect', async () => {
    const onChange = vi.fn();
    const shape: ShapeInstance = {
      ...createShape('rect', 300, 300, '#005538', '#005538'),
      id: 's1',
      flipY: true,
    };
    const node = await shapeNode(shape, onChange);
    expect(node.scaleY()).toBe(-1);
    expect(node.scaleX()).toBe(1);
    node.scaleX(2);
    node.scaleY(-2);
    node.fire('transformend');
    const attrs = onChange.mock.calls[0][0] as { width: number; height: number; scaleY: number };
    expect(attrs.width).toBeCloseTo(shape.width * 2);
    expect(attrs.height).toBeCloseTo(shape.height * 2);
    expect(attrs.scaleY).toBe(1);
    expect(node.scaleY()).toBe(-1);
    expect(node.scaleX()).toBe(1);
  });

  it('mirrors path shapes with the same magnitude', async () => {
    const base = { ...createShape('leaf', 300, 300, '#005538', '#005538'), id: 'p1' };
    const plain = await shapeNode(base);
    const flipped = await shapeNode({ ...base, id: 'p2', flipX: true });
    expect(flipped.scaleX()).toBeCloseTo(-plain.scaleX());
    expect(flipped.scaleY()).toBeCloseTo(plain.scaleY());
  });

  it('unflipped rect renders as before', async () => {
    const shape = { ...createShape('rect', 300, 300, '#005538', '#005538'), id: 's3' };
    const node = await shapeNode(shape);
    expect(node.scaleX()).toBe(1);
    expect(node.scaleY()).toBe(1);
  });
});

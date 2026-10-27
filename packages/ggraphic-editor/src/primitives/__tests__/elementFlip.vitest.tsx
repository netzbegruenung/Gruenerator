// SPDX-License-Identifier: MPL-2.0
import { act, render } from '@testing-library/react';
import Konva from 'konva';
import { createRef, useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AssetPrimitive } from '@ggraphic/editor/primitives/AssetPrimitive';
import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { IconPrimitive } from '@ggraphic/editor/primitives/IconPrimitive';
import { IllustrationPrimitive } from '@ggraphic/editor/primitives/IllustrationPrimitive';
import { ShapePrimitive } from '@ggraphic/editor/primitives/ShapePrimitive';
import { createShape, type ShapeInstance } from '@ggraphic/editor/utils/shapes';

import { FIXTURE_ASSET_ID, registerFixtureAssets } from '../../testing/fixtureTemplates';

vi.mock('@ggraphic/editor/utils/canvasIcons', () => ({
  generateIconDataUrl: vi.fn(() => Promise.resolve('data:image/png;base64,AA==')),
}));
vi.mock('@ggraphic/editor/utils/illustrations/registry', () => ({
  findIllustrationById: vi.fn(() =>
    Promise.resolve({ id: 'ill', name: 'ill', filename: 'ill.svg', source: 'undraw', tags: [] })
  ),
  getIllustrationPath: vi.fn(() => 'https://example.org/ill.svg'),
}));
vi.mock('@ggraphic/editor/utils/illustrations/svgCache', () => ({
  getCachedSVG: vi.fn(() => 'data:image/png;base64,AA=='),
  getSVG: vi.fn(() => Promise.resolve('data:image/png;base64,AA==')),
}));

beforeAll(() => {
  registerFixtureAssets();
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

/**
 * Icon, Illustration und Asset spiegeln ihr Bild, nicht die Gruppe am
 * Transformer: die Gruppe bleibt positiv skaliert, das Kind trägt das Vorzeichen.
 */
const mirrorOf = (group: Konva.Node) => {
  const image = (group as Konva.Group).findOne('Image')!;
  return { x: image.scaleX(), y: image.scaleY() };
};

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
    expect(mirrorOf(flipped)).toEqual({ x: -1, y: 1 });
    expect(flipped.scaleX()).toBeCloseTo(plain.scaleX());
    expect(flipped.scaleY()).toBeCloseTo(plain.scaleY());
  });

  it('leaves unflipped nodes unchanged', async () => {
    const node = await mount(icon(), 'Group');
    expect(node.scaleX()).toBeGreaterThan(0);
    expect(node.scaleY()).toBeGreaterThan(0);
    expect(node.scaleX()).toBeCloseTo(node.scaleY());
    expect(mirrorOf(node)).toEqual({ x: 1, y: 1 });
  });

  it('reports a positive scale after a resize and keeps the mirror', async () => {
    const onTransformEnd = vi.fn();
    const node = await mount(icon(true, false, onTransformEnd), 'Group');
    const base = node.scaleX() / 2;
    node.scaleX(4 * base);
    node.scaleY(4 * base);
    node.fire('transformend');
    expect(onTransformEnd).toHaveBeenCalledTimes(1);
    expect(onTransformEnd.mock.calls[0][2]).toBeCloseTo(4);
    expect(node.scaleX()).toBeCloseTo(2 * base);
    expect(node.scaleY()).toBeCloseTo(2 * base);
    expect(mirrorOf(node)).toEqual({ x: -1, y: 1 });
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
    expect(mirrorOf(node)).toEqual({ x: 1, y: -1 });
    const base = node.scaleY() / 2;
    node.scaleX(3 * base);
    node.scaleY(3 * base);
    node.fire('transformend');
    expect(onTransformEnd.mock.calls[0][2]).toBeCloseTo(3);
    expect(node.scaleY()).toBeCloseTo(2 * base);
    expect(node.scaleX()).toBeCloseTo(2 * base);
    expect(mirrorOf(node)).toEqual({ x: 1, y: -1 });
  });
});

describe('asset flip', () => {
  it('mirrors and keeps the sign through a resize', async () => {
    const onTransformEnd = vi.fn();
    const node = await mount(
      <AssetPrimitive
        asset={{
          id: 'a',
          assetId: FIXTURE_ASSET_ID,
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
    expect(node.scaleX()).toBe(2);
    expect(mirrorOf(node)).toEqual({ x: -1, y: 1 });
    node.scaleX(3);
    node.scaleY(3);
    node.fire('transformend');
    expect(onTransformEnd.mock.calls[0][2]).toBe(3);
    expect(node.scaleX()).toBe(2);
    expect(node.scaleY()).toBe(2);
    expect(mirrorOf(node)).toEqual({ x: -1, y: 1 });
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
      ...createShape('rect', 300, 300, '#808080', '#808080'),
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
    const base = { ...createShape('leaf', 300, 300, '#808080', '#808080'), id: 'p1' };
    const plain = await shapeNode(base);
    const flipped = await shapeNode({ ...base, id: 'p2', flipX: true });
    expect(flipped.scaleX()).toBeCloseTo(-plain.scaleX());
    expect(flipped.scaleY()).toBeCloseTo(plain.scaleY());
  });

  it('unflipped rect renders as before', async () => {
    const shape = { ...createShape('rect', 300, 300, '#808080', '#808080'), id: 's3' };
    const node = await shapeNode(shape);
    expect(node.scaleX()).toBe(1);
    expect(node.scaleY()).toBe(1);
  });
});

/**
 * Dreht über den Transformer, genau wie Konvas Rotations-Griff: die Box um ihre
 * Mitte (`rotateAroundCenter`), `_fitNodesInto`, dann Konvas eigenes Ende. Gibt
 * die Matrix des Elements kurz vor dem Loslassen zurück.
 */
function rotateByHandle(tr: Konva.Transformer, deg: number): number[] {
  const internal = tr as unknown as {
    _getNodeRect: () => { x: number; y: number; width: number; height: number; rotation: number };
    _fitNodesInto: (attrs: object, evt: object) => void;
    _transforming: boolean;
    _removeEvents: (e: unknown) => void;
  };
  const box = internal._getNodeRect();
  const r = box.rotation;
  const cx = box.x + (box.width / 2) * Math.cos(r) - (box.height / 2) * Math.sin(r);
  const cy = box.y + (box.height / 2) * Math.cos(r) + (box.width / 2) * Math.sin(r);
  const a = (deg * Math.PI) / 180;
  const x = cx + (box.x - cx) * Math.cos(a) - (box.y - cy) * Math.sin(a);
  const y = cy + (box.x - cx) * Math.sin(a) + (box.y - cy) * Math.cos(a);
  let during: number[] = [];
  act(() => {
    internal._transforming = true;
    internal._fitNodesInto({ ...box, x, y, rotation: r + a }, {});
    during = linear(tr.nodes()[0]!);
    internal._removeEvents({});
  });
  return during;
}

/** Linearer Teil der sichtbaren Matrix — was man sieht, unabhängig von der Zerlegung. */
const linear = (node: Konva.Node) =>
  node
    .getAbsoluteTransform()
    .getMatrix()
    .slice(0, 4)
    .map((v) => Math.round(v * 1e4) / 1e4 + 0);

function Stateful<T>({
  initial,
  children,
}: {
  initial: T;
  children: (state: T, merge: (patch: Partial<T>) => void) => React.ReactElement;
}) {
  const [state, setState] = useState(initial);
  return children(state, (patch) => setState((prev) => ({ ...prev, ...patch })));
}

/** Erst laden, dann auswählen — wie in der App; der Transformer hängt sich bei der Auswahl an. */
async function mountSelected(ui: (selected: boolean) => React.ReactElement) {
  const stageRef = createRef<CanvasStageRef>();
  const tree = (selected: boolean) => (
    <CanvasStage ref={stageRef} width={600} height={600}>
      {ui(selected)}
    </CanvasStage>
  );
  let rerender: (ui: React.ReactElement) => void = () => {};
  await act(async () => {
    rerender = render(tree(false)).rerender;
    await new Promise((r) => setTimeout(r, 0));
  });
  await act(async () => {
    rerender(tree(true));
    await new Promise((r) => setTimeout(r, 0));
  });
  const stage = stageRef.current!.getStage()!;
  const tr = stage.findOne('Transformer') as Konva.Transformer;
  return { stage, tr, node: tr.nodes()[0]! };
}

describe('rotating a flipped element by its handle', () => {
  const persisted = { rotation: 0 };

  const cases: Array<[string, (selected: boolean) => React.ReactElement]> = [
    [
      'icon (flipX)',
      (selected) => (
        <Stateful initial={{ rotation: 0 }}>
          {(s, merge) => (
            <IconPrimitive
              id="i"
              icon="x"
              x={300}
              y={300}
              scale={2}
              rotation={s.rotation}
              flipX
              selected={selected}
              onSelect={noop}
              onDragEnd={noop}
              onTransformEnd={(_x, _y, _s, rotation) => {
                persisted.rotation = rotation;
                merge({ rotation });
              }}
            />
          )}
        </Stateful>
      ),
    ],
    [
      'illustration (flipX + flipY)',
      (selected) => (
        <Stateful initial={{ rotation: 0 }}>
          {(s, merge) => (
            <IllustrationPrimitive
              illustration={{
                id: 'il',
                illustrationId: 'ill',
                source: 'undraw',
                x: 300,
                y: 300,
                scale: 2,
                rotation: s.rotation,
                opacity: 1,
                flipX: true,
                flipY: true,
              }}
              isSelected={selected}
              onSelect={noop}
              onDragEnd={noop}
              onTransformEnd={(_x, _y, _s, rotation) => {
                persisted.rotation = rotation;
                merge({ rotation });
              }}
            />
          )}
        </Stateful>
      ),
    ],
    [
      'asset (flipX)',
      (selected) => (
        <Stateful initial={{ rotation: 0 }}>
          {(s, merge) => (
            <AssetPrimitive
              asset={{
                id: 'a',
                assetId: FIXTURE_ASSET_ID,
                x: 300,
                y: 300,
                scale: 2,
                rotation: s.rotation,
                opacity: 1,
                flipX: true,
              }}
              isSelected={selected}
              onSelect={noop}
              onDragEnd={noop}
              onTransformEnd={(_x, _y, _s, rotation) => {
                persisted.rotation = rotation;
                merge({ rotation });
              }}
            />
          )}
        </Stateful>
      ),
    ],
    [
      'shape (flipX)',
      (selected) => (
        <Stateful
          initial={{
            ...createShape('leaf', 300, 300, '#808080', '#808080'),
            id: 'sf',
            flipX: true,
          }}
        >
          {(s, merge) => (
            <ShapePrimitive
              shape={s}
              isSelected={selected}
              onSelect={noop}
              onChange={(attrs) => {
                persisted.rotation = attrs.rotation ?? persisted.rotation;
                merge(attrs);
              }}
            />
          )}
        </Stateful>
      ),
    ],
  ];

  it.each(cases)('%s keeps the angle it showed at release', async (_name, ui) => {
    persisted.rotation = 0;
    const { tr, node } = await mountSelected(ui);
    const during = rotateByHandle(tr, 30);
    expect(persisted.rotation).toBeCloseTo(30);
    expect(linear(node)).toEqual(during);
    // Der Griff dreht wieder von dieser Lage aus weiter, ohne Sprung.
    const again = rotateByHandle(tr, 15);
    expect(persisted.rotation).toBeCloseTo(45);
    expect(linear(node)).toEqual(again);
  });
});

describe('rotate handle placement on real primitives', () => {
  const rotaterY = (tr: Konva.Transformer) => tr.findOne('.rotater')!.getAbsolutePosition().y;

  it('an icon near the page top gets its handle below, on the page (D3)', async () => {
    const { tr, node } = await mountSelected((selected) => (
      <IconPrimitive
        id="top"
        icon="x"
        x={300}
        y={40}
        scale={1}
        rotation={0}
        selected={selected}
        onSelect={noop}
        onDragEnd={noop}
        onTransformEnd={noop}
      />
    ));
    expect(tr.rotateAnchorAngle()).toBe(180);
    expect(rotaterY(tr)).toBeGreaterThan(node.getClientRect().y);
    expect(rotaterY(tr)).toBeLessThan(600);
  });

  it('a flipped shape shows its handle visibly below (D1)', async () => {
    const { tr, node } = await mountSelected((selected) => (
      <ShapePrimitive
        shape={{ ...createShape('leaf', 300, 300, '#808080', '#808080'), id: 'fh', flipX: true }}
        isSelected={selected}
        onSelect={noop}
        onChange={noop}
      />
    ));
    const box = node.getClientRect();
    expect(rotaterY(tr)).toBeGreaterThan(box.y + box.height);
  });
});

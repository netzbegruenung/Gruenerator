/**
 * Fährt der Zeiger über ein verschiebbares Element, zeigt `useHoverOutline`
 * (Canva-Muster) einen dünnen Rahmen darum und den Verschiebe-Cursor — damit
 * klar ist, was ein Druck greift. Der Hintergrund bekommt keinen Rahmen, ein
 * schon ausgewähltes Element auch nicht (dort steht der Transformer). Der
 * Rahmen heißt `selection-chrome`, also darf er in keinem Export landen.
 */
import { render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { Group, Rect } from 'react-konva';
import { describe, expect, it, vi } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage';

function mount(listening = true) {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={400} height={300} responsive={false} listening={listening}>
      <Rect id="background-image" x={0} y={0} width={400} height={300} fill="#eee" draggable />
      <Rect name="canvas-background" x={0} y={0} width={400} height={300} draggable />
      <Group id="motiv-group" x={100} y={50} draggable>
        <Rect id="motiv" x={10} y={20} width={80} height={40} fill="#005538" />
      </Group>
      <Rect id="free" x={250} y={150} width={60} height={30} fill="#e6007e" draggable />
    </CanvasStage>
  );
  const stage = stageRef.current!.getStage()!;
  const layer = stage.getLayers()[0]!;
  const outline = () =>
    layer.find<Konva.Rect>('.selection-chrome').find((n) => n.stroke() === 'rgb(0, 161, 255)');
  const cursor = () => stage.container().style.cursor;
  return { stageRef, stage, layer, outline, cursor };
}

const hover = (node: Konva.Node) =>
  node.fire('mouseover', { evt: new MouseEvent('mouseover') }, true);

describe('useHoverOutline', () => {
  it('rahmt das Element unter dem Zeiger ein und zeigt den Verschiebe-Cursor', () => {
    const { stage, layer, outline, cursor } = mount();
    const free = stage.findOne('#free')!;

    hover(free);

    const rect = outline()!;
    expect(rect.visible()).toBe(true);
    expect(cursor()).toBe('move');
    const expected = free.getClientRect({ relativeTo: layer });
    expect({ x: rect.x(), y: rect.y(), width: rect.width(), height: rect.height() }).toEqual(
      expected
    );
  });

  it('nimmt den verschiebbaren Vorfahren, nicht die getroffene Form', () => {
    const { stage, layer, outline } = mount();
    const group = stage.findOne('#motiv-group')!;

    hover(stage.findOne('#motiv')!);

    const rect = outline()!;
    expect(rect.visible()).toBe(true);
    expect(rect.x()).toBe(group.getClientRect({ relativeTo: layer }).x);
    expect(rect.x()).toBe(110);
  });

  it('zeigt über dem Hintergrund keinen Rahmen und keinen Cursor', () => {
    const { stage, outline, cursor } = mount();
    hover(stage.findOne('#free')!);

    hover(stage.findOne('#background-image')!);
    expect(outline()!.visible()).toBe(false);
    expect(cursor()).toBe('');

    hover(stage.findOne('#free')!);
    hover(stage.findOne('.canvas-background')!);
    expect(outline()!.visible()).toBe(false);
    expect(cursor()).toBe('');
  });

  it('versteckt den Rahmen bei mousedown und beim Verlassen der Bühne', () => {
    const { stage, outline, cursor } = mount();
    const free = stage.findOne('#free')!;

    hover(free);
    free.fire('mousedown', { evt: new MouseEvent('mousedown') }, true);
    expect(outline()!.visible()).toBe(false);

    hover(free);
    stage.fire('mouseleave', { evt: new MouseEvent('mouseleave') });
    expect(outline()!.visible()).toBe(false);
    expect(cursor()).toBe('');
  });

  it('rahmt ein ausgewähltes Element nicht ein, behält aber den Cursor', () => {
    const { stage, layer, outline, cursor } = mount();
    const free = stage.findOne('#free')!;
    layer.add(new Konva.Transformer({ nodes: [free] }));

    hover(free);
    expect(outline()!.visible()).toBe(false);
    expect(cursor()).toBe('move');
  });

  it('legt ohne listening keinen Rahmen an', () => {
    const { outline } = mount(false);
    expect(outline()).toBeUndefined();
  });

  it('blendet den Rahmen beim Export aus', () => {
    const { stageRef, stage, outline } = mount();
    hover(stage.findOne('#free')!);
    const rect = outline()!;

    const seen: boolean[] = [];
    vi.spyOn(stage, 'toDataURL').mockImplementation(() => {
      seen.push(rect.visible());
      return 'data:image/png;base64,AAAA';
    });

    stageRef.current!.toDataURL({ pixelRatio: 1 });
    expect(seen).toEqual([false]);
    expect(rect.visible()).toBe(true);
  });
});

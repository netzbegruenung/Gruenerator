/**
 * Ein gedrehtes Element rastet mit seiner sichtbaren Box ein und meldet sie
 * auch als Snap-Ziel — nicht die ungedrehte Box.
 */
import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { CanvasText } from '@ggraphic/editor/primitives/CanvasText';
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { SnapTarget } from '@ggraphic/editor/utils/snapping';
import type Konva from 'konva';

function renderRotatedText(
  targets: SnapTarget[],
  onGeometryChange?: (id: string, x: number, y: number, w: number, h: number) => void,
  onPositionChange?: (id: string, x: number, y: number, w: number, h: number) => void
): Konva.Node {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={1000} height={1000}>
      <CanvasText
        id="text-1"
        text="Klimaschutz"
        x={20}
        y={300}
        width={200}
        rotation={90}
        fontSize={24}
        fontFamily="PT Sans, Arial, sans-serif"
        draggable
        stageWidth={1000}
        stageHeight={1000}
        getSnapTargets={(excludeId) => targets.filter((t) => t.id !== excludeId)}
        onGeometryChange={onGeometryChange}
        onPositionChange={onPositionChange}
      />
    </CanvasStage>
  );
  const stage = stageRef.current?.getStage();
  const node = stage?.findOne<Konva.Node>((n: Konva.Node) => n.id() === 'text-1' && n.draggable());
  if (!node) throw new Error('Kein ziehbarer Text');
  return node;
}

describe('Snap mit gedrehter Box', () => {
  it('ein 90° gedrehter Text rastet mit seiner 200 hohen Box an einer Oberkante ein', () => {
    // Gedreht reicht die Box von y bis y + 200 (die Textbreite). Unten bei 902 →
    // 2 px über der Zielkante 900. Ungedreht wäre die Unterkante y + Zeilenhöhe.
    const node = renderRotatedText([{ id: 'other', x: 300, y: 900, width: 200, height: 40 }]);

    act(() => {
      node.y(702);
      node.fire('dragmove', { target: node, evt: new MouseEvent('mousemove') });
    });

    expect(node.y()).toBeCloseTo(700, 6);
  });

  it('meldet die achsparallele gedrehte Box als Geometrie', () => {
    const report = vi.fn();
    const node = renderRotatedText([], report);
    const lineHeight = node.height();

    expect(report).toHaveBeenCalled();
    const [, x, y, w, h] = report.mock.lastCall as [string, number, number, number, number];
    expect(x).toBeCloseTo(20 - lineHeight, 6);
    expect(y).toBeCloseTo(300, 6);
    expect(w).toBeCloseTo(lineHeight, 6);
    expect(h).toBeCloseTo(200, 6);
  });

  it('nach einem Drag zurück an den Start steht die gedrehte Box in den Snap-Zielen', () => {
    // Beide Wege schreiben in dieselbe Map — wie registerGeometry und
    // updateElementPosition in elementPositions.
    const store = new Map<string, [number, number, number, number]>();
    const write = (id: string, x: number, y: number, w: number, h: number) => {
      store.set(id, [x, y, w, h]);
    };
    const node = renderRotatedText([], write, write);
    const lineHeight = node.height();

    act(() => {
      node.fire('dragstart', { target: node, evt: new MouseEvent('mousedown') });
      node.fire('dragend', { target: node, evt: new MouseEvent('mouseup') });
    });

    const [x, y, w, h] = store.get('text-1') ?? [NaN, NaN, NaN, NaN];
    expect(x).toBeCloseTo(20 - lineHeight, 6);
    expect(y).toBeCloseTo(300, 6);
    expect(w).toBeCloseTo(lineHeight, 6);
    expect(h).toBeCloseTo(200, 6);
  });
});

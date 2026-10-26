/**
 * Freier Text dreht: der Griff schreibt `rotation` mit der Position zurück,
 * die Memo-Vergleiche zeichnen bei reiner Drehung neu, und jeder Editor
 * (Text, Pille, Kreis-Badge) öffnet sich gedreht an Ort und Stelle.
 */
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { overlayBoxForNode } from '../../components/CanvasTextOverlay';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage';
import { CanvasText } from '../CanvasText';
import { CircleBadge } from '../CircleBadge';
import { PillBadge } from '../PillBadge';

import type Konva from 'konva';

afterEach(() => {
  cleanup();
  document.body.querySelectorAll('textarea, input').forEach((el) => el.remove());
});

function mount(element: (rotation: number) => React.ReactNode, rotation = 0) {
  const stageRef = createRef<CanvasStageRef>();
  const view = render(
    <CanvasStage ref={stageRef} width={600} height={600} responsive={false}>
      {element(rotation)}
    </CanvasStage>
  );
  const stage = stageRef.current!.getStage()!;
  return {
    stage,
    rerender: (next: number) =>
      view.rerender(
        <CanvasStage ref={stageRef} width={600} height={600} responsive={false}>
          {element(next)}
        </CanvasStage>
      ),
  };
}

const textElement = (props: Record<string, unknown>) => (rotation: number) => (
  <CanvasText
    id="t"
    text="Klimaschutz"
    x={40}
    y={60}
    width={300}
    fontSize={30}
    rotation={rotation}
    {...props}
  />
);

describe.each([
  ['CanvasText', 'Klimaschutz'],
  ['CanvasRichText', '- Klimaschutz'],
])('%s dreht', (name, text) => {
  const isRich = name === 'CanvasRichText';
  it('writes rotation with position after a handle turn', () => {
    const onTransformEnd = vi.fn();
    const { stage } = mount(textElement({ text, selected: true, onTransformEnd }));
    const node = stage.findOne('#t')!;
    expect(node.getClassName()).toBe(isRich ? 'Group' : 'Text');

    node.rotation(30);
    node.position({ x: 100, y: 120 });
    node.fire('transformend');

    expect(onTransformEnd).toHaveBeenCalledTimes(1);
    const [x, y, width, sx, sy, rotation] = onTransformEnd.mock.calls[0]!;
    expect([x, y, width, sx, sy, rotation]).toEqual([100, 120, 300, 1, 1, 30]);
  });

  it('redraws when only rotation changes', () => {
    const { stage, rerender } = mount(textElement({ text }), 0);
    expect(stage.findOne('#t')!.rotation()).toBe(0);

    rerender(25);

    expect(stage.findOne('#t')!.rotation()).toBe(25);
  });
});

describe('Editor dreht mit', () => {
  it('opens the editor rotated in place', () => {
    const { stage } = mount(textElement({}), 30);
    const node = stage.findOne('#t')!;

    const box = overlayBoxForNode(node, 300, 40)!;

    expect(box.rotation).toBe(30);
  });

  it('rotates the pill editor about the badge origin', () => {
    const { stage } = mount(() => (
      <PillBadge
        id="p"
        text="Neu"
        x={50}
        y={70}
        backgroundColor="#0f0"
        textColor="#000"
        fontSize={24}
        fontFamily="Arial"
        fontStyle="normal"
        rotation={30}
        scale={1}
        paddingX={10}
        paddingY={6}
        cornerRadius={8}
        selected={false}
        onSelect={() => {}}
        onTextChange={() => {}}
        onDragEnd={() => {}}
        onTransformEnd={() => {}}
        onSnapChange={() => {}}
        onSnapLinesChange={() => {}}
        getSnapTargets={() => []}
        stageWidth={600}
        stageHeight={600}
      />
    ));
    act(() => {
      stage.findOne('Group')!.fire('dblclick');
    });

    const textarea = document.body.querySelector('textarea')!;
    expect(textarea.style.transform).toContain('rotate(30deg)');
    expect(textarea.style.transformOrigin).toBe('-10px -6px');
  });

  it('rotates the circle badge editor', () => {
    const { stage } = mount(() => (
      <CircleBadge
        id="c"
        x={200}
        y={200}
        radius={80}
        backgroundColor="#0f0"
        textColor="#000"
        rotation={30}
        scale={1}
        textLines={[{ text: 'Neu', yOffset: 0, fontFamily: 'Arial', fontSize: 24 }]}
        selected={false}
        onSelect={() => {}}
        onDragEnd={() => {}}
        onTransformEnd={() => {}}
        onTextLineChange={() => {}}
        onSnapChange={() => {}}
        onSnapLinesChange={() => {}}
        getSnapTargets={() => []}
        stageWidth={600}
        stageHeight={600}
      />
    ));
    const label = stage.find<Konva.Text>('Text')[0]!;
    act(() => {
      label.fire('dblclick');
    });

    const input = document.body.querySelector('input')!;
    expect(input.style.transform).toContain('rotate(30deg)');
  });
});

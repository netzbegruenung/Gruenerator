/**
 * Snap-Ziele werden beim Ziehen gelesen, nicht beim Rendern.
 *
 * Text bekam die Liste früher als Prop-Schnappschuss, und sein Memo-Vergleich
 * ignorierte sie. Ein Element, das nach dem letzten Rendern des Textes
 * verschoben wurde, war für ihn also noch an der alten Stelle — die linke
 * Kante eines verschobenen Textes zog nicht an.
 */
import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { CanvasText } from '@ggraphic/editor/primitives/CanvasText';
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import type { SnapTarget } from '@ggraphic/editor/utils/snapping';
import type Konva from 'konva';

function dragTo(text: string, x: number, targets: SnapTarget[]): number {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={1000} height={1000}>
      <CanvasText
        id="text-1"
        text={text}
        x={20}
        y={700}
        width={200}
        fontSize={24}
        fontFamily="PT Sans, Arial, sans-serif"
        draggable
        stageWidth={1000}
        stageHeight={1000}
        getSnapTargets={(excludeId) => targets.filter((t) => t.id !== excludeId)}
      />
    </CanvasStage>
  );
  const stage = stageRef.current?.getStage();
  const node = stage?.findOne<Konva.Node>((n: Konva.Node) => n.id() === 'text-1' && n.draggable());
  if (!node) throw new Error('Kein ziehbarer Text');

  // Erst NACH dem Rendern taucht das Ziel auf — wie ein Element, das danach verschoben wurde.
  targets.push({ id: 'other', x: 300, y: 640, width: 200, height: 40 });

  act(() => {
    node.x(x);
    node.fire('dragmove', { target: node, evt: new MouseEvent('mousemove') });
  });
  return node.x();
}

describe('Snap-Ziele beim Ziehen', () => {
  it('glatter Text rastet an einer erst später gemeldeten Kante ein', () => {
    expect(dragTo('Klimaschutz', 292, [])).toBe(300);
  });

  it('Rich-Text auch', () => {
    expect(dragTo('**Klimaschutz** jetzt', 292, [])).toBe(300);
  });
});

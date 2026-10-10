/**
 * Zieht man einen Textblock am Seitengriff, soll der Text unter dem Zeiger
 * neu umbrechen statt gestaucht zu werden und beim Loslassen zu springen.
 * Dafür wandeln `CanvasText` und `CanvasRichText` eine reine Breitenskalierung
 * schon während `transform` in Breite um; erst `transformend` übergibt sie.
 * Eckgriffe (scaleY ≠ 1) skalieren weiter und ändern beim Loslassen die
 * Schriftgröße.
 */
import { act, render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CanvasRichText } from '../CanvasRichText';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage';
import { CanvasText, isWidthOnlyScale } from '../CanvasText';

const LONG_TEXT =
  'Klimaschutz braucht Mut und Zusammenhalt in jeder Gemeinde unseres Landes jetzt sofort';

function mount(element: React.ReactNode) {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={1080} height={1080} responsive={false}>
      {element}
    </CanvasStage>
  );
  return stageRef.current!.getStage()!;
}

describe('isWidthOnlyScale', () => {
  const node = (scaleX: number, scaleY: number) => new Konva.Rect({ scaleX, scaleY });

  it('erkennt einen Seitengriff (nur scaleX geändert)', () => {
    expect(isWidthOnlyScale(node(0.6, 1))).toBe(true);
    expect(isWidthOnlyScale(node(1.4, 1))).toBe(true);
  });

  it('lehnt Eckgriffe und unveränderte Knoten ab', () => {
    expect(isWidthOnlyScale(node(1.5, 1.5))).toBe(false);
    expect(isWidthOnlyScale(node(1, 1.2))).toBe(false);
    expect(isWidthOnlyScale(node(1, 1))).toBe(false);
  });
});

describe('CanvasText beim Transformieren', () => {
  function mountText() {
    const onTransformEnd = vi.fn();
    const onFontSizeChange = vi.fn();
    const stage = mount(
      <CanvasText
        id="headline"
        text={LONG_TEXT}
        x={40}
        y={60}
        width={600}
        fontSize={40}
        onTransformEnd={onTransformEnd}
        onFontSizeChange={onFontSizeChange}
      />
    );
    const node = stage.findOne<Konva.Text>('#headline')!;
    return { node, onTransformEnd, onFontSizeChange };
  }

  it('bricht beim Seitengriff live um und übergibt die Breite beim Loslassen', () => {
    const { node, onTransformEnd, onFontSizeChange } = mountText();
    const linesBefore = node.textArr.length;

    node.scaleX(0.6);
    node.fire('transform');

    expect(node.scaleX()).toBe(1);
    expect(node.width()).toBeCloseTo(360);
    expect(node.textArr.length).toBeGreaterThan(linesBefore);

    node.fire('transformend');
    expect(onTransformEnd).toHaveBeenCalledTimes(1);
    const [x, y, width, sx, sy] = onTransformEnd.mock.calls[0]!;
    expect([x, y, sx, sy]).toEqual([40, 60, 1, 1]);
    expect(width).toBeCloseTo(360);
    expect(onFontSizeChange).not.toHaveBeenCalled();
    expect(node.fontSize()).toBe(40);
  });

  it('lässt Eckgriffe skalieren und ändert erst beim Loslassen die Schriftgröße', () => {
    const { node, onTransformEnd, onFontSizeChange } = mountText();

    node.scale({ x: 1.5, y: 1.5 });
    node.fire('transform');
    expect(node.scaleX()).toBe(1.5);
    expect(node.scaleY()).toBe(1.5);
    expect(node.width()).toBe(600);

    node.fire('transformend');
    expect(onFontSizeChange).toHaveBeenCalledWith(60);
    expect(onTransformEnd).toHaveBeenCalledWith(40, 60, 900, 1, 1);
  });
});

describe('CanvasRichText beim Transformieren', () => {
  it('bricht beim Seitengriff live um und übergibt die Breite beim Loslassen', () => {
    const onTransformEnd = vi.fn();
    const onFontSizeChange = vi.fn();
    const stage = mount(
      <CanvasRichText
        id="rich"
        richText
        text={`- ${LONG_TEXT}`}
        x={40}
        y={60}
        width={600}
        fontSize={40}
        onTransformEnd={onTransformEnd}
        onFontSizeChange={onFontSizeChange}
      />
    );
    const group = stage.findOne<Konva.Group>('#rich')!;
    const textNodes = () => group.find('Text').length;
    const nodesBefore = textNodes();
    const heightBefore = group.height();
    expect(group.width()).toBe(600);

    act(() => {
      group.scaleX(0.6);
      group.fire('transform');
    });

    expect(group.scaleX()).toBe(1);
    expect(group.width()).toBeCloseTo(360);
    expect(group.height()).toBeGreaterThan(heightBefore);
    expect(textNodes()).toBeGreaterThan(nodesBefore);

    act(() => {
      group.fire('transformend');
    });
    expect(onTransformEnd).toHaveBeenCalledWith(40, 60, 360, 1, 1);
    expect(onFontSizeChange).not.toHaveBeenCalled();
  });
});

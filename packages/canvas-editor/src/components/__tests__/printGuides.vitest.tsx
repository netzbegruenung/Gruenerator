/**
 * Hilfslinien für Druckformate: nur bei Print vorhanden, als `selection-chrome`
 * getaggt, damit kein Export sie sieht; digitale Formate bekommen keinen Knoten.
 */
import { PrintGuides } from '@ggraphic/editor/components/PrintGuides';
import {
  CANVAS_FORMATS,
  printGeometry,
  type PrintCanvasFormat,
} from '@ggraphic/editor/formats/index';
import { CanvasStage, type CanvasStageRef } from '@ggraphic/editor/primitives/CanvasStage';
import { withSelectionChromeHidden } from '@ggraphic/editor/utils/captureStage';
import { render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import type Konva from 'konva';

// useHoverOutline adds its own selection-chrome rect; only the guides count here.
const guideNodes = (stage: Konva.Stage) =>
  stage
    .find('.selection-chrome')
    .filter((n) => n.name() === 'selection-chrome' && n.getType() === 'Group');

function mount(formatId: string) {
  const format = CANVAS_FORMATS.find((f) => f.id === formatId)!;
  const ref = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={ref} width={400} height={300} responsive={false}>
      <PrintGuides format={format} />
    </CanvasStage>
  );
  return { format, stage: ref.current!.getStage()! };
}

describe('PrintGuides', () => {
  it('zeichnet bei Druckformaten Beschnitt-, Schutzzonenlinie und Abdunklung', () => {
    const { format, stage } = mount('print-a3-hoch');
    const { trim, safe } = printGeometry(format as PrintCanvasFormat);
    const trimLine = stage.findOne<Konva.Line>('.print-trim-line')!;
    const safeLine = stage.findOne<Konva.Line>('.print-safe-line')!;
    expect(trimLine.points().slice(0, 2)).toEqual([trim.x, trim.y]);
    expect(safeLine.points().slice(0, 2)).toEqual([safe.x, safe.y]);
    expect(trimLine.strokeScaleEnabled()).toBe(false);
    expect(trimLine.dash().length).toBeGreaterThan(0);
    expect(stage.find('.bleed-shade')).toHaveLength(4);
    expect(guideNodes(stage).every((n) => !n.listening())).toBe(true);
  });

  it('wird beim Export-Capture ausgeblendet und danach wiederhergestellt', () => {
    const { stage } = mount('print-a3-hoch');
    const guides = guideNodes(stage);
    expect(guides).toHaveLength(1);
    const during = withSelectionChromeHidden(stage, () => guides.map((n) => n.visible()));
    expect(during.every((v) => v === false)).toBe(true);
    expect(guides.every((n) => n.visible())).toBe(true);
  });

  it('rendert für digitale Formate keinen Knoten', () => {
    const digital = CANVAS_FORMATS.find((f) => f.category === 'digital')!;
    const { stage } = mount(digital.id);
    expect(guideNodes(stage)).toHaveLength(0);
    expect(stage.find('.print-trim-line')).toHaveLength(0);
  });
});

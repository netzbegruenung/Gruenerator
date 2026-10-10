/**
 * Ein Textblock mit Auszeichnung wird auf React-Seite vermessen und das
 * Ergebnis im Memo gehalten. Misst der erste Durchlauf, bevor der Fettschnitt
 * da ist, steht die Ersatzschrift-Breite — „**Risiko** ." zeigte dann eine
 * Lücke hinter dem Fettlauf. Trifft der Schnitt ein, muss der Block neu
 * gerechnet werden; und weil Safari über ein Canvas allein nichts lädt, muss
 * die Messung den Schnitt selbst anfordern, sonst käme `loadingdone` nie.
 */
import { act, render } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { measureTextWidthWithFont } from '../../utils/textUtils';
import { CanvasRichText } from '../CanvasRichText';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage';

import type * as TextUtils from '../../utils/textUtils';
import type Konva from 'konva';

const fonts = vi.hoisted(() => {
  const target = new EventTarget() as EventTarget & {
    check: ReturnType<typeof vi.fn>;
    ready: Promise<void>;
    load: ReturnType<typeof vi.fn>;
  };
  target.check = vi.fn(() => false);
  target.ready = Promise.resolve();
  target.load = vi.fn(() => Promise.resolve([]));
  Object.defineProperty(document, 'fonts', { value: target, configurable: true });
  return target;
});

const measured = vi.hoisted(() => ({ factor: 1 }));

vi.mock('../../utils/textUtils', async (importOriginal) => ({
  ...(await importOriginal<typeof TextUtils>()),
  runMeasurer: () => (text: string) => text.length * 10 * measured.factor,
}));

function mountRich() {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={1080} height={1080} responsive={false}>
      <CanvasRichText
        id="rich"
        richText
        text="**Risiko** Wandel Zukunft"
        x={0}
        y={0}
        width={1000}
        fontSize={40}
      />
    </CanvasStage>
  );
  return stageRef.current!.getStage()!;
}

function widestText(stage: Konva.Stage): number {
  return Math.max(...stage.find<Konva.Text>('Text').map((node) => node.x() + node.width()));
}

describe('CanvasRichText nach dem Nachladen der Schrift', () => {
  it('rechnet den Umbruch neu, sobald ein Schriftschnitt eintrifft', () => {
    measured.factor = 1;
    const stage = mountRich();
    const withFallbackFont = widestText(stage);

    measured.factor = 0.5;
    act(() => {
      fonts.dispatchEvent(new Event('loadingdone'));
    });

    expect(widestText(stage)).toBeLessThan(withFallbackFont);
  });
});

describe('measureTextWidthWithFont', () => {
  it('fordert einen noch nicht geladenen Schnitt einmal an', () => {
    fonts.load.mockClear();

    measureTextWidthWithFont('Risiko', 40, 'GrueneTypeNeue', 'bold');
    measureTextWidthWithFont('Wandel', 40, 'GrueneTypeNeue', 'bold');

    expect(fonts.load).toHaveBeenCalledTimes(1);
    expect(fonts.load.mock.calls[0]![0]).toContain('GrueneTypeNeue');
  });

  it('prüft einen geladenen Schnitt nur einmal und fordert ihn nicht an', () => {
    fonts.load.mockClear();
    fonts.check.mockClear();
    fonts.check.mockReturnValue(true);

    for (let i = 0; i < 20; i++) measureTextWidthWithFont(`Wort ${i}`, 40, 'PT Sans', 'normal');

    expect(fonts.check).toHaveBeenCalledTimes(1);
    expect(fonts.load).not.toHaveBeenCalled();
    fonts.check.mockReturnValue(false);
  });

  it('lässt die Messung nicht an einer werfenden Schriftanfrage scheitern', () => {
    fonts.check.mockImplementationOnce(() => {
      throw new SyntaxError('bad font');
    });

    expect(() => measureTextWidthWithFont('Wort', 40, 'Font 2', 'normal')).not.toThrow();
  });

  it('fordert bei einem CSS-Stapel nur die erste Familie an', () => {
    fonts.load.mockClear();
    fonts.check.mockClear();

    measureTextWidthWithFont('Wort', 40, 'Stack Face, Arial, sans-serif', 'bold');

    expect(fonts.check.mock.calls[0]![0]).toBe('bold 40px "Stack Face"');
    expect(fonts.load.mock.calls[0]![0]).toBe('bold 40px "Stack Face"');
  });
});

/**
 * Ein Verlauf auf einem Text mit Auszeichnung: CanvasRichText setzt je Lauf
 * einen eigenen Knoten. Ohne Weitergabe ging der Verlauf dort still verloren,
 * sobald ein Wort fett war.
 */
import { render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage';
import { CanvasText } from '../CanvasText';

import type { GradientFill } from '../../utils/gradientFill';

const GRADIENT: GradientFill = {
  type: 'linear',
  angle: 0,
  stops: [
    { offset: 0, color: '#8ABD24' },
    { offset: 1, color: '#0BA1DD' },
  ],
};

function stageOf(text: string) {
  Konva.autoDrawEnabled = false;
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={600} height={600}>
      <CanvasText
        id="t"
        text={text}
        x={10}
        y={10}
        width={500}
        fontSize={24}
        fontFamily="PT Sans, Arial, sans-serif"
        fill="#FFFFFF"
        fillGradient={GRADIENT}
      />
    </CanvasStage>
  );
  return stageRef.current!.getStage()!;
}
const textNode = (stage: Konva.Stage, needle: string) =>
  stage.find('Text').find((n) => (n as Konva.Text).text().includes(needle)) as Konva.Text;

describe('Verlauf auf Rich-Text', () => {
  it('jeder Lauf trägt denselben, durchgehenden Verlauf', () => {
    const stage = stageOf('Ich will **frei** atmen');
    const runs = ['Ich will', 'frei', 'atmen'].map((needle) => textNode(stage, needle));

    for (const run of runs) {
      expect(run.fillPriority()).toBe('linear-gradient');
      expect(run.fillLinearGradientColorStops()).toEqual([0, '#8ABD24', 1, '#0BA1DD']);
    }
    // Der Verlauf beginnt für alle Läufe am selben Blockrand, nicht an jedem Lauf neu.
    const origins = runs.map((run) => run.x() + run.fillLinearGradientStartPoint().x);
    expect(new Set(origins.map((o) => Math.round(o))).size).toBe(1);
    expect(runs[1]!.x()).toBeGreaterThan(runs[0]!.x());
  });

  it('eine Akzentfarbe bleibt einfarbig', () => {
    const stage = stageOf('Ich will =={#E6007E}atmen==');
    const accent = textNode(stage, 'atmen');
    expect(accent.fill()).toBe('#E6007E');
    expect(accent.fillPriority()).toBe('color');
    expect(textNode(stage, 'Ich will').fillPriority()).toBe('linear-gradient');
  });
});

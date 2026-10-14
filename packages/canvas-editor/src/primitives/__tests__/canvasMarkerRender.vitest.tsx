/**
 * Ein ++Marker++ auf einem Foto: weißer Kasten, dunkle Schrift, KEIN Schatten
 * des Fototexts darin (Live-Befund: weiße Schrift auf weißem Kasten, mit Halo).
 */
import { render } from '@testing-library/react';
import Konva from 'konva';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../CanvasStage';
import { CanvasText } from '../CanvasText';

function stageOf(text: string, withMarker: boolean) {
  // Gezeichnet wird nicht: der Canvas-Treiber der Testumgebung kennt keinen Schatten-Puffer.
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
        shadowColor="#000000"
        shadowBlur={18}
        shadowOpacity={0.45}
        marker={withMarker ? { fill: '#FFFFFF', color: '#00261A' } : null}
      />
    </CanvasStage>
  );
  const stage = stageRef.current!.getStage()!;
  return stage;
}
const textNode = (stage: Konva.Stage, needle: string) =>
  stage.find('Text').find((n) => (n as Konva.Text).text().includes(needle)) as Konva.Text;

describe('Marker auf Fototext', () => {
  it('setzt den markierten Lauf dunkel, ohne Schatten und Kontur, den Rest unverändert', () => {
    const stage = stageOf('Ich will ++frei atmen++ können', true);
    const marked = textNode(stage, 'frei');
    expect(marked.fill()).toBe('#00261A');
    expect([marked.shadowBlur(), marked.shadowOpacity(), marked.shadowColor()]).toEqual([
      0,
      1,
      undefined,
    ]);
    const plain = textNode(stage, 'Ich will');
    expect(plain.fill()).toBe('#FFFFFF');
    expect(plain.shadowBlur()).toBe(18);
    expect(stage.find('Rect').some((r) => (r as Konva.Rect).fill() === '#FFFFFF')).toBe(true);
  });

  it('ohne Markerstil der Vorlage bekommt der Lauf den Standardkasten', () => {
    const stage = stageOf('Ich will ++frei atmen++ können', false);
    expect(textNode(stage, 'frei').fill()).toBe('#00261A');
    expect(stage.find('Rect').some((r) => (r as Konva.Rect).fill() === '#BEFF60')).toBe(true);
  });

  it('eine Passagenfarbe färbt Kasten und Akzent', () => {
    const stage = stageOf('Ich will ++{#00261A}frei++ =={#E6007E}atmen==', false);
    expect(stage.find('Rect').some((r) => (r as Konva.Rect).fill() === '#00261A')).toBe(true);
    expect(textNode(stage, 'frei').fill()).toBe('#FFFFFF');
    expect(textNode(stage, 'atmen').fill()).toBe('#E6007E');
  });
});

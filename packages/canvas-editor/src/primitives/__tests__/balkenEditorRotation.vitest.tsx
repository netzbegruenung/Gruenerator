/**
 * Der Zeilen-Editor der Balken (dreizeilen) öffnet sich gedreht an Ort und
 * Stelle, wie Text, Pille und Kreis-Badge: `rotate(…)` um die linke obere Ecke
 * des Eingabefelds, die auf dem gedrehten Textknoten liegt.
 */
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BalkenGroup } from '../BalkenGroup';
import { CanvasStage, type CanvasStageRef } from '../CanvasStage';

import type Konva from 'konva';

// jsdom kennt kein `document.fonts`; `useFontGeneration` hängt seinen
// `loadingdone`-Listener beim Modul-Import an — also muss das Ziel vorher da sein.
vi.hoisted(() => {
  const target = new EventTarget() as EventTarget & {
    check: () => boolean;
    ready: Promise<void>;
    load: () => Promise<never[]>;
  };
  target.check = () => false;
  target.ready = Promise.resolve();
  target.load = () => Promise.resolve([]);
  Object.defineProperty(document, 'fonts', { value: target, configurable: true });
});

afterEach(() => {
  cleanup();
  document.body.querySelectorAll('input').forEach((el) => el.remove());
});

function mount(rotation: number) {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={1080} height={1080} responsive={false}>
      <BalkenGroup
        mode="triple"
        colorSchemeId="tanne-sand"
        texts={['Mut zum Wandel', 'Grüne Ideen', 'Gemeinsam gestalten']}
        offset={{ x: 0, y: 0 }}
        scale={1}
        widthScale={1}
        rotation={rotation}
        selected={false}
        onSelect={() => {}}
        onDragEnd={() => {}}
        onTransformEnd={() => {}}
        onTextChange={() => {}}
        onSnapChange={() => {}}
        onSnapLinesChange={() => {}}
        getSnapTargets={() => []}
        stageWidth={1080}
        stageHeight={1080}
      />
    </CanvasStage>
  );
  return stageRef.current!.getStage()!;
}

describe('Balken-Editor dreht mit', () => {
  it.each([0, 30])('öffnet das Feld bei %s° gedreht auf der Zeile', (rotation) => {
    const stage = mount(rotation);
    const line = stage.find<Konva.Text>('Text')[1]!;
    act(() => {
      line.fire('dblclick');
    });

    const input = document.body.querySelector('input')!;
    expect(input.style.transform).toBe(`rotate(${rotation}deg)`);
    expect(input.style.transformOrigin).toBe('left top');
    // Die Ecke des Felds liegt auf dem Textknoten: links, um die Leerhöhe der Zeile eingerückt.
    const inset = (line.height() - line.fontSize() * 1.1) / 2;
    const corner = line.getAbsoluteTransform().point({ x: 0, y: inset });
    expect(parseFloat(input.style.left)).toBeCloseTo(corner.x, 3);
    expect(parseFloat(input.style.top)).toBeCloseTo(corner.y, 3);
  });
});

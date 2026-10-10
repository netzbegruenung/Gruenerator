/**
 * iOS Safari zoomt in Eingabefelder mit weniger als 16px Schrift. Der Editor
 * rendert deshalb mindestens mit 16px und nimmt die Größe per `transform`
 * zurück (#4386).
 */
import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CanvasStage, type CanvasStageRef } from '../../primitives/CanvasStage';
import { CanvasText } from '../../primitives/CanvasText';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function editor(fontSize: number) {
  const stageRef = createRef<CanvasStageRef>();
  render(
    <CanvasStage ref={stageRef} width={600} height={600}>
      <CanvasText
        id="text-1"
        x={10}
        y={20}
        width={400}
        fontSize={fontSize}
        text="Klimaschutz"
        editable
        onTextChange={() => {}}
      />
    </CanvasStage>
  );
  const stage = stageRef.current?.getStage();
  const node = stage?.findOne('#text-1');
  if (!stage || !node) throw new Error('Textknoten nicht auf der Bühne gefunden');
  act(() => {
    node.fire('dblclick');
  });
  const overlay = document.querySelector<HTMLElement>('body > div[style*="z-index: 10000"]');
  const content = overlay?.querySelector<HTMLElement>('.canvas-rte > div:last-child');
  if (!overlay || !content) throw new Error('Editor nicht geöffnet');
  return { overlay, content };
}

describe('Text-Editor ohne iOS-Zoom', () => {
  it('rendert kleine Schrift mit 16px und skaliert sie zurück', () => {
    const { overlay, content } = editor(8);

    expect(parseFloat(content.style.fontSize)).toBeGreaterThanOrEqual(16);
    expect(content.style.fontSize).toBe('16px');
    expect(content.style.transform).toBe('scale(0.5)');
    expect(content.style.transformOrigin).toBe('top left');
    expect(parseFloat(content.style.width) * 0.5).toBeCloseTo(parseFloat(overlay.style.width));
  });

  it('lässt Schrift ab 16px unverändert', () => {
    const { content } = editor(24);

    expect(content.style.fontSize).toBe('24px');
    expect(content.style.transform).toBe('');
  });
});

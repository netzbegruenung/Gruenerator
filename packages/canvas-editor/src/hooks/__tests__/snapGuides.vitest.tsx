/**
 * Hilfslinien: gezeichnet wird genau, was der Snap meldet — keine Mittellinie
 * neben einer Element-Linie, und ein Sprung auf eine andere Linie gleicher
 * Anzahl kommt an.
 */
import { act, render, renderHook } from '@testing-library/react';
import { Layer, Stage } from 'react-konva';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SnapGuidelines } from '../../primitives/SnapGuidelines';
import { CanvasStoreProvider, useCanvasStore } from '../../stores/CanvasStoreProvider';
import { useSnapScheduler } from '../useSnapScheduler';

import type { CanvasEditorStoreApi } from '../../stores/createCanvasEditorStore';
import type { SnapLine } from '../../utils/snapping';
import type Konva from 'konva';

const elementLine: SnapLine = { orientation: 'vertical', position: 300, start: 0, end: 100 };

function mountGuides() {
  const storeRef: { current: CanvasEditorStoreApi | null } = { current: null };
  const layerRef: { current: Konva.Layer | null } = { current: null };
  function Grab() {
    storeRef.current = useCanvasStore();
    return null;
  }
  render(
    <CanvasStoreProvider>
      <Grab />
      <Stage width={1000} height={1000}>
        <Layer ref={(l) => void (layerRef.current = l)}>
          <SnapGuidelines />
        </Layer>
      </Stage>
    </CanvasStoreProvider>
  );
  return {
    store: storeRef.current!,
    lines: () => layerRef.current!.find('Line') as Konva.Line[],
  };
}

describe('SnapGuidelines', () => {
  it('zeichnet bei einem Element-Snap keine Seitenmitte dazu', () => {
    const { store, lines } = mountGuides();
    act(() => {
      // So meldet es ein Element-Snap: Achse eingerastet, die Linie liegt beim Element.
      store.getState().setSnapGuides(true, false);
      store.getState().setSnapLines([elementLine]);
    });
    expect(lines().map((l) => l.points())).toEqual([[300, 0, 300, 100]]);
  });
});

describe('useSnapScheduler', () => {
  let frames: FrameRequestCallback[] = [];
  beforeEach(() => {
    frames = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frames.push(cb);
      return frames.length;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());
  const flush = () => {
    const pending = frames;
    frames = [];
    pending.forEach((cb) => cb(0));
  };

  it('schreibt einen Sprung auf eine andere Linie, auch wenn die Anzahl gleich bleibt', () => {
    const onSnapLinesChange = vi.fn();
    const { result } = renderHook(() =>
      useSnapScheduler({ onSnapChange: () => {}, onSnapLinesChange })
    );
    result.current.onDragStart();
    result.current.scheduleSnap(true, false, [elementLine]);
    flush();
    const moved: SnapLine = { ...elementLine, position: 420 };
    result.current.scheduleSnap(true, false, [moved]);
    flush();
    expect(onSnapLinesChange).toHaveBeenLastCalledWith([moved]);
  });

  it('schreibt nichts, wenn sich nichts ändert', () => {
    const onSnapLinesChange = vi.fn();
    const { result } = renderHook(() =>
      useSnapScheduler({ onSnapChange: () => {}, onSnapLinesChange })
    );
    result.current.onDragStart();
    result.current.scheduleSnap(true, false, [elementLine]);
    flush();
    result.current.scheduleSnap(true, false, [{ ...elementLine }]);
    flush();
    expect(onSnapLinesChange).toHaveBeenCalledTimes(1);
  });
});

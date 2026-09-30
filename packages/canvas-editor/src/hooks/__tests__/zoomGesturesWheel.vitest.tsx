import { renderHook } from '@testing-library/react';
import Konva from 'konva';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useZoomGestures } from '../useZoomGestures';

/**
 * Das Mausrad über dem Sharepic: scrollt normal, zoomt mit Strg/Cmd — und
 * tut beides nicht, solange ein Element gezogen wird (die Seite liefe sonst
 * unter dem Zeiger weg).
 *
 * Der Hook bekommt das Element, keinen Ref: der Editor rendert zuerst eine
 * Ladeanzeige, und ein Effekt auf einem Ref lief nach dem Einhängen des
 * Containers nie wieder — Pinch und Strg+Rad waren dadurch tot.
 */

function mountContainer() {
  const area = document.createElement('div');
  area.className = 'canvas-editor-layout__canvas';
  const container = document.createElement('div');
  area.appendChild(container);
  document.body.appendChild(area);
  return container;
}

function wheel(target: HTMLElement, ctrlKey = false) {
  const e = new WheelEvent('wheel', { deltaY: 100, ctrlKey, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

describe('useZoomGestures: Mausrad', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('scrollt ohne Ziehen, zoomt mit Strg und sperrt beides während des Ziehens', () => {
    const container = mountContainer();
    const onZoom = vi.fn();
    renderHook(() => useZoomGestures(container, onZoom));

    expect(wheel(container)).toBe(false);
    expect(wheel(container, true)).toBe(true);
    expect(onZoom).toHaveBeenCalledTimes(1);

    vi.spyOn(Konva, 'isDragging').mockReturnValue(true);
    expect(wheel(container)).toBe(true);
    expect(wheel(container, true)).toBe(true);
    expect(onZoom).toHaveBeenCalledTimes(1);
  });

  it('hängt sich an, wenn der Container erst nach dem Laden erscheint', () => {
    const onZoom = vi.fn();
    const { rerender } = renderHook(({ el }) => useZoomGestures(el, onZoom), {
      initialProps: { el: null as HTMLElement | null },
    });
    const container = mountContainer();
    rerender({ el: container });

    expect(wheel(container, true)).toBe(true);
    expect(onZoom).toHaveBeenCalledTimes(1);
  });
});

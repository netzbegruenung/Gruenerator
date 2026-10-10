import { renderHook } from '@testing-library/react';
import Konva from 'konva';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useZoomGestures } from '../useZoomGestures';

/**
 * Das Mausrad über dem Sharepic: scrollt normal, zoomt mit Strg/Cmd — und
 * tut beides nicht, solange ein Element gezogen wird (die Seite liefe sonst
 * unter dem Zeiger weg).
 *
 * Der Hook bekommt das Element, keinen Ref: der Editor rendert zuerst eine
 * Ladeanzeige, und ein Effekt auf einem Ref lief nach dem Einhängen des
 * Containers nie wieder — Pinch und Strg+Rad waren dadurch tot.
 *
 * Während der Geste folgt die Skalierung direkt über `--canvas-zoom` (ohne
 * CSS-Transition, die hinterherzog); der React-Zustand kommt erst, wenn die
 * Geste ruht — sonst rendert die ganze Editor-Hülle bei jedem Rad-Ereignis.
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
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('scrollt ohne Ziehen, zoomt mit Strg und sperrt beides während des Ziehens', () => {
    const container = mountContainer();
    const onZoom = vi.fn();
    renderHook(() => useZoomGestures(container, onZoom));

    expect(wheel(container)).toBe(false);
    expect(wheel(container, true)).toBe(true);
    vi.advanceTimersByTime(200);
    expect(onZoom).toHaveBeenCalledTimes(1);

    vi.spyOn(Konva, 'isDragging').mockReturnValue(true);
    expect(wheel(container)).toBe(true);
    expect(wheel(container, true)).toBe(true);
    vi.advanceTimersByTime(200);
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
    vi.advanceTimersByTime(200);
    expect(onZoom).toHaveBeenCalledTimes(1);
  });

  it('skaliert während der Geste live und meldet den Endwert einmal, wenn sie ruht', () => {
    const container = mountContainer();
    container.style.setProperty('--canvas-zoom', '1');
    const onZoom = vi.fn();
    renderHook(() => useZoomGestures(container, onZoom));

    wheel(container, true);
    wheel(container, true);
    wheel(container, true);
    expect(container.hasAttribute('data-zooming')).toBe(true);
    vi.advanceTimersToNextFrame();
    const live = parseFloat(container.style.getPropertyValue('--canvas-zoom'));
    expect(live).toBeCloseTo(Math.exp(-0.6), 5);
    expect(onZoom).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(onZoom.mock.calls[0]?.[0]).toBeCloseTo(live, 5);
    expect(container.hasAttribute('data-zooming')).toBe(false);
  });

  it('hält den Punkt unter dem Mauszeiger, indem es den Scroll-Container mitscrollt', () => {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy as typeof scroller.scrollBy;
    const area = document.createElement('div');
    area.className = 'canvas-editor-layout__canvas';
    const container = document.createElement('div');
    container.style.setProperty('--canvas-zoom', '1');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 100 } as DOMRect);
    area.appendChild(container);
    scroller.appendChild(area);
    document.body.appendChild(scroller);
    renderHook(() => useZoomGestures(container, vi.fn()));

    container.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        clientY: 300,
        bubbles: true,
        cancelable: true,
      })
    );
    vi.advanceTimersToNextFrame();

    // 200 px unter der Oberkante, Zoom 1 → e^0.2: der Punkt rutscht um 200·(z−1).
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy.mock.calls[0]?.[1]).toBeCloseTo(200 * (Math.exp(0.2) - 1), 5);
  });
});

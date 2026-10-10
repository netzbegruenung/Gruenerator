import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { horizontalAnchorScroll, useZoomGestures } from '../useZoomGestures';

/**
 * Mobil skaliert der Seiten-Container von links oben (#4387): gezoomt ragt er
 * nur nach rechts über, wo die Spalte scrollen kann — zentriert lag die linke
 * Hälfte des Überstands außer Reichweite. Damit der Punkt unter den Fingern
 * stehen bleibt, scrollt die Geste auch waagerecht mit; solange die Seiten
 * schmaler als die Spalte sind, zentriert sie canvas-editor.css per
 * translateX(max(0, (1 − s) · 50 %)), und die Rechnung zieht das mit.
 */

/** Bildschirm-x eines Inhaltspunkts bei Skala s (Scroll 0, Spaltenbreite w). */
const screenX = (contentX: number, s: number, w: number) =>
  Math.max(0, ((1 - s) * w) / 2) + contentX * s;

describe('horizontalAnchorScroll', () => {
  it('hält einen Punkt beim Hineinzoomen über 100 % hinaus fest', () => {
    const w = 390;
    const before = screenX(300, 1, w);
    const dx = horizontalAnchorScroll(before, w, 1, 1.5);
    expect(screenX(300, 1.5, w) - dx).toBeCloseTo(before, 6);
  });

  it('rechnet die Zentrierung unter 100 % mit ein', () => {
    const w = 400;
    const before = screenX(100, 0.5, w);
    const dx = horizontalAnchorScroll(before - Math.max(0, (1 - 0.5) * w * 0.5), w, 0.5, 1.2);
    expect(screenX(100, 1.2, w) - dx).toBeCloseTo(before, 6);
  });

  it('scrollt nicht, solange die Seiten schmaler als die Spalte bleiben und der Punkt die Mitte ist', () => {
    expect(horizontalAnchorScroll(100, 400, 0.5, 0.8)).toBeCloseTo(0, 6);
  });
});

describe('useZoomGestures: waagerechter Anker', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function mount() {
    const scroller = document.createElement('div');
    scroller.style.overflowY = 'auto';
    const scrollBy = vi.fn();
    scroller.scrollBy = scrollBy as typeof scroller.scrollBy;
    const area = document.createElement('div');
    area.className = 'canvas-editor-layout__canvas';
    const container = document.createElement('div');
    container.style.setProperty('--canvas-zoom', '1');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({ top: 0, left: 0 } as DOMRect);
    Object.defineProperty(container, 'offsetWidth', { value: 390 });
    area.appendChild(container);
    scroller.appendChild(area);
    document.body.appendChild(scroller);
    return { container, scrollBy };
  }

  function zoomIn(container: HTMLElement) {
    container.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -100,
        ctrlKey: true,
        clientX: 300,
        clientY: 0,
        bubbles: true,
        cancelable: true,
      })
    );
    vi.advanceTimersToNextFrame();
  }

  it('scrollt mobil (Ursprung links) waagerecht mit', () => {
    vi.useFakeTimers();
    const { container, scrollBy } = mount();
    renderHook(() => useZoomGestures(container, vi.fn(), { leftOrigin: true }));
    zoomIn(container);
    expect(scrollBy.mock.calls[0]?.[0]).toBeCloseTo(300 * (Math.exp(0.2) - 1), 5);
  });

  it('lässt den zentrierten Desktop-Container waagerecht in Ruhe', () => {
    vi.useFakeTimers();
    const { container, scrollBy } = mount();
    renderHook(() => useZoomGestures(container, vi.fn()));
    zoomIn(container);
    expect(scrollBy.mock.calls[0]?.[0]).toBe(0);
  });
});

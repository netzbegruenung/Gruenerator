/**
 * A thumbnail mirrors what its canvas shows. An AI proposal that recoloured an
 * off-screen slide waited for the slow rotation (one other page per tick), so
 * the strip showed the old colour while the canvas showed the new one.
 *
 * Each capture is a synchronous scene render + PNG encode on the main thread,
 * so the tick only recaptures pages whose state changed, never mid-gesture,
 * and — where the browser offers it — inside an idle callback.
 */
import { act, renderHook } from '@testing-library/react';
import Konva from 'konva';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePageThumbnails } from '../usePageThumbnails';

import type { GenericCanvasRef } from '../../components/GenericCanvas';
import type { HeterogeneousPage } from '../../configs/types';

const shown = new Map<string, string>();
const page = (id: string, color: string): HeterogeneousPage => ({
  id,
  configId: 'freeform',
  state: { backgroundColor: color },
});
const refFor = (id: string) => ({
  current: { toDataURL: () => shown.get(id) ?? '' } as unknown as GenericCanvasRef,
});

function mountDeck(ids: string[]) {
  for (const id of ids) shown.set(id, `${id}:mint`);
  const canvasRefs = ids.map(refFor);
  const spies = canvasRefs.map((ref) => vi.spyOn(ref.current, 'toDataURL'));
  const pages = ids.map((id) => page(id, 'mint'));
  const hook = renderHook(({ pages }) => usePageThumbnails({ pages, canvasRefs }), {
    initialProps: { pages },
  });
  const totalCalls = () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
  return { ...hook, pages, spies, totalCalls };
}

const tick = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('usePageThumbnails', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('recaptures a page whose state changed on the next tick, wherever the rotation is', () => {
    const ids = ['p1', 'p2', 'p3', 'p4'];
    for (const id of ids) shown.set(id, `${id}:mint`);
    const canvasRefs = ids.map(refFor);
    const { result, rerender } = renderHook(
      ({ pages }) => usePageThumbnails({ pages, canvasRefs }),
      { initialProps: { pages: ids.map((id) => page(id, 'mint')) } }
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.get('p4')).toBe('p4:mint');

    shown.set('p4', 'p4:tanne');
    rerender({ pages: ids.map((id) => page(id, id === 'p4' ? 'tanne' : 'mint')) });
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(result.current.get('p4')).toBe('p4:tanne');
  });

  it('nimmt bei unveränderten Seiten nach den Erstaufnahmen nichts mehr auf', () => {
    const { result, totalCalls } = mountDeck(['p1', 'p2', 'p3']);
    tick(2000);
    expect(result.current.get('p3')).toBe('p3:mint');
    const afterInitial = totalCalls();

    tick(15_000);

    expect(totalCalls()).toBe(afterInitial);
  });

  it('wartet mit der Aufnahme, solange gezogen wird, und holt sie im ersten Tick danach nach', () => {
    const { result, rerender, pages, spies } = mountDeck(['p1', 'p2']);
    tick(2000);
    const dragging = vi.spyOn(Konva, 'isDragging').mockReturnValue(true);
    const p2Calls = spies[1].mock.calls.length;

    shown.set('p2', 'p2:tanne');
    rerender({ pages: [pages[0], page('p2', 'tanne')] });
    tick(1500);
    tick(1500);
    expect(spies[1].mock.calls.length).toBe(p2Calls);
    expect(result.current.get('p2')).toBe('p2:mint');

    dragging.mockReturnValue(false);
    tick(1500);

    expect(spies[1].mock.calls.length).toBe(p2Calls + 1);
    expect(result.current.get('p2')).toBe('p2:tanne');
  });

  it('wartet auch während einer Transformation', () => {
    const { result, rerender } = mountDeck(['p1']);
    tick(2000);
    const transforming = vi.spyOn(Konva, 'isTransforming').mockReturnValue(true);

    shown.set('p1', 'p1:tanne');
    rerender({ pages: [page('p1', 'tanne')] });
    tick(1500);
    expect(result.current.get('p1')).toBe('p1:mint');

    transforming.mockReturnValue(false);
    tick(1500);
    expect(result.current.get('p1')).toBe('p1:tanne');
  });

  it('nimmt mit requestIdleCallback erst im Idle-Callback auf', () => {
    const idle: Array<() => void> = [];
    const requestIdle = vi.fn((cb: () => void, _options?: IdleRequestOptions) => {
      idle.push(cb);
      return idle.length;
    });
    vi.stubGlobal('requestIdleCallback', requestIdle);
    vi.stubGlobal('cancelIdleCallback', vi.fn());

    const { result, rerender, pages, spies } = mountDeck(['p1', 'p2']);
    tick(2000);
    // Ohne Änderung wird gar kein Idle-Slot angefragt.
    expect(requestIdle).not.toHaveBeenCalled();
    const p2Calls = spies[1].mock.calls.length;

    shown.set('p2', 'p2:tanne');
    rerender({ pages: [pages[0], page('p2', 'tanne')] });
    tick(1500);
    expect(requestIdle).toHaveBeenCalledTimes(1);
    expect(requestIdle.mock.calls[0][1]).toEqual({ timeout: 1500 });
    expect(spies[1].mock.calls.length).toBe(p2Calls);

    // Ein offener Idle-Slot wird nicht doppelt angefragt.
    tick(1500);
    expect(requestIdle).toHaveBeenCalledTimes(1);

    act(() => {
      idle[0]();
    });

    expect(spies[1].mock.calls.length).toBe(p2Calls + 1);
    expect(result.current.get('p2')).toBe('p2:tanne');
  });
});

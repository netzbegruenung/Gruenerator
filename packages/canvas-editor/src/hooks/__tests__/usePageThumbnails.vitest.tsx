/**
 * A thumbnail mirrors what its canvas shows. An AI proposal that recoloured an
 * off-screen slide waited for the slow rotation (one other page per tick), so
 * the strip showed the old colour while the canvas showed the new one.
 */
import { act, renderHook } from '@testing-library/react';
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

describe('usePageThumbnails', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('recaptures a page whose state changed on the next tick, wherever the rotation is', () => {
    const ids = ['p1', 'p2', 'p3', 'p4'];
    for (const id of ids) shown.set(id, `${id}:mint`);
    const canvasRefs = ids.map(refFor);
    const { result, rerender } = renderHook(
      ({ pages }) => usePageThumbnails({ pages, canvasRefs, currentPageIndex: 0 }),
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
});

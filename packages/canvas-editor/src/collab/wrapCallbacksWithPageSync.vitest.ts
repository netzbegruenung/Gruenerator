import { describe, it, expect, vi } from 'vitest';

import { wrapCallbacksWithPageSync } from './wrapCallbacksWithPageSync';

describe('wrapCallbacksWithPageSync', () => {
  it('dual-writes on<Key>Change callbacks into page state with the lowercased key', () => {
    const onLine1Change = vi.fn();
    const writePageState = vi.fn();
    const wrapped = wrapCallbacksWithPageSync({ onLine1Change }, writePageState);

    wrapped.onLine1Change('GRÜN WIRKT');

    expect(onLine1Change).toHaveBeenCalledWith('GRÜN WIRKT');
    expect(writePageState).toHaveBeenCalledWith({ line1: 'GRÜN WIRKT' });
  });

  it('maps multi-word keys (onCurrentImageSrcChange → currentImageSrc)', () => {
    const fn = vi.fn();
    const writePageState = vi.fn();
    const wrapped = wrapCallbacksWithPageSync({ onCurrentImageSrcChange: fn }, writePageState);

    wrapped.onCurrentImageSrcChange('/img.jpg');

    expect(writePageState).toHaveBeenCalledWith({ currentImageSrc: '/img.jpg' });
  });

  it('passes non-conventional callback names through untouched', () => {
    const onReset = vi.fn();
    const writePageState = vi.fn();
    const wrapped = wrapCallbacksWithPageSync({ onReset }, writePageState);

    wrapped.onReset(undefined);

    expect(onReset).toHaveBeenCalled();
    expect(writePageState).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';

import { createPageSyncedCallbacks } from './wrapCallbacksWithPageSync';

describe('createPageSyncedCallbacks', () => {
  it('dual-writes on<Key>Change callbacks into page state with the lowercased key', () => {
    const onLine1Change = vi.fn();
    const writePageState = vi.fn();
    const wrapped = createPageSyncedCallbacks(() => ({ onLine1Change }), writePageState);

    wrapped.onLine1Change('GRÜN WIRKT');

    expect(onLine1Change).toHaveBeenCalledWith('GRÜN WIRKT');
    expect(writePageState).toHaveBeenCalledWith({ line1: 'GRÜN WIRKT' });
  });

  it('maps multi-word keys (onCurrentImageSrcChange → currentImageSrc)', () => {
    const fn = vi.fn();
    const writePageState = vi.fn();
    const wrapped = createPageSyncedCallbacks(
      () => ({ onCurrentImageSrcChange: fn }),
      writePageState
    );

    wrapped.onCurrentImageSrcChange('/img.jpg');

    expect(writePageState).toHaveBeenCalledWith({ currentImageSrc: '/img.jpg' });
  });

  it('passes non-conventional callback names through without page writes', () => {
    const onReset = vi.fn();
    const writePageState = vi.fn();
    const wrapped = createPageSyncedCallbacks(() => ({ onReset }), writePageState);

    wrapped.onReset(undefined);

    expect(onReset).toHaveBeenCalled();
    expect(writePageState).not.toHaveBeenCalled();
  });

  it('resolves the host callback at call time (fresh objects per render)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const writePageState = vi.fn();
    let current: Record<string, (val: unknown) => void> = { onHeadlineChange: first };

    const wrapped = createPageSyncedCallbacks(() => current, writePageState);
    wrapped.onHeadlineChange('a');
    current = { onHeadlineChange: second };
    wrapped.onHeadlineChange('b');

    expect(first).toHaveBeenCalledWith('a');
    expect(second).toHaveBeenCalledWith('b');
    expect(writePageState).toHaveBeenNthCalledWith(1, { headline: 'a' });
    expect(writePageState).toHaveBeenNthCalledWith(2, { headline: 'b' });
  });
});

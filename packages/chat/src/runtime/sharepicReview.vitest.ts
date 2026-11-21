import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useChatConfigStore } from '../stores/chatConfigStore';
import { useSharepicLiveStore } from '../stores/sharepicLiveStore';
import { useSharepicReviewStore } from '../stores/sharepicReviewStore';

import { saveFreshSharepic } from './sharepicReview';

import type { SharepicVariant } from '../hooks/useChatGraphStream';

const variant = (id: string, extra: Partial<SharepicVariant> = {}): SharepicVariant =>
  ({ id, canvasType: 'freeform', initialProps: { headline: id }, ...extra }) as SharepicVariant;

describe('saveFreshSharepic', () => {
  const saveSharepic = vi.fn<(v: SharepicVariant, threadId: string) => Promise<string | null>>();
  const renderSharepic = vi.fn(async () => 'data:image/png;base64,AA');
  const updateSharepicThumbnail = vi.fn(async () => {});

  beforeEach(() => {
    saveSharepic.mockReset();
    renderSharepic.mockClear();
    updateSharepicThumbnail.mockClear();
    useChatConfigStore.setState({ saveSharepic, renderSharepic, updateSharepicThumbnail });
    useSharepicLiveStore.setState({ entries: {} });
    useSharepicReviewStore.setState({ reviewed: {}, checking: {} });
  });

  it('saves only the primary variant, with its reviewed spec, and uploads a thumbnail', async () => {
    saveSharepic.mockResolvedValue('canvas-1');
    useSharepicReviewStore.setState({ reviewed: { a: { headline: 'korrigiert' } } });
    await saveFreshSharepic('thread-1', [variant('a'), variant('b')]);

    expect(saveSharepic).toHaveBeenCalledTimes(1);
    expect(saveSharepic.mock.calls[0][0].initialProps).toEqual({ headline: 'korrigiert' });
    expect(saveSharepic.mock.calls[0][1]).toBe('thread-1');
    expect(useSharepicLiveStore.getState().entries.a?.canvasId).toBe('canvas-1');
    expect(updateSharepicThumbnail).toHaveBeenCalledWith('canvas-1', 'data:image/png;base64,AA');
  });

  it('leaves an already saved variant alone', async () => {
    await saveFreshSharepic('thread-1', [variant('a', { canvasId: 'c' })]);
    useSharepicLiveStore.setState({ entries: { b: { canvasId: 'x' } as never } });
    await saveFreshSharepic('thread-1', [variant('b')]);
    expect(saveSharepic).not.toHaveBeenCalled();
  });

  it('skips the thumbnail when nothing was saved', async () => {
    saveSharepic.mockResolvedValue(null);
    await saveFreshSharepic('thread-1', [variant('a')]);
    expect(updateSharepicThumbnail).not.toHaveBeenCalled();
  });
});

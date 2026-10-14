import { type SavedProfilbildSticker } from '@gruenerator/shared/profilbild';
import { describe, expect, it, vi } from 'vitest';

import { restoreSavedStickers, stickerBox } from './profilbildStickers';

describe('stickerBox', () => {
  it('bakes the node scale into width and height and keeps position and rotation', () => {
    expect(
      stickerBox(
        { width: 200, height: 100 },
        { x: 300, y: 400, scaleX: 1.5, scaleY: 0.5, rotation: 45 }
      )
    ).toEqual({ x: 300, y: 400, width: 300, height: 50, rotation: 45 });
  });

  it('is the identity at scale 1', () => {
    expect(
      stickerBox({ width: 80, height: 60 }, { x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0 })
    ).toEqual({ x: 1, y: 2, width: 80, height: 60, rotation: 0 });
  });
});

describe('restoreSavedStickers', () => {
  const box = { x: 0, y: 0, width: 100, height: 100, rotation: 0 };
  const saved = [
    { id: 'sonnenblume', ...box },
    { id: 'herz', ...box },
    { id: 'asset:a-1', src: '/api/share/tok/download', ...box },
  ] as SavedProfilbildSticker[];

  it('keeps a system sticker that fails to load instead of losing every sticker', async () => {
    const onError = vi.fn();
    const result = await restoreSavedStickers(
      saved,
      (s) => (s.id === 'herz' ? Promise.reject(new Error('404')) : Promise.resolve(s.id)),
      onError
    );
    expect(result).toEqual({ placed: ['sonnenblume', 'asset:a-1'], unrestored: [saved[1]] });
    expect(onError).toHaveBeenCalledOnce();
  });

  it('keeps every failed sticker, in saved order', async () => {
    const result = await restoreSavedStickers(
      saved,
      (s) => (s.id === 'sonnenblume' ? Promise.resolve(s.id) : Promise.reject(new Error('x'))),
      () => {}
    );
    expect(result).toEqual({ placed: ['sonnenblume'], unrestored: [saved[1], saved[2]] });
  });

  it('skips what has nothing to draw without keeping it', async () => {
    const result = await restoreSavedStickers(
      saved,
      () => Promise.resolve(null),
      () => {}
    );
    expect(result).toEqual({ placed: [], unrestored: [] });
  });
});

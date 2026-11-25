import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import { detectPreviewKind, videoPosterShareToken } from './contentPreviews.js';

describe('detectPreviewKind: video projects', () => {
  it("returns 'video' for a doc with videoMeta and creates no BlockNote root", () => {
    const ydoc = new Y.Doc();
    ydoc.getMap('videoMeta').set('schemaVersion', 1);
    ydoc.getMap('videoOverlays');

    expect(detectPreviewKind(ydoc)).toBe('video');
    expect(ydoc.share.has('default')).toBe(false);
  });
});

describe('videoPosterShareToken', () => {
  const docWith = (overlays: Record<string, unknown>[]) => {
    const ydoc = new Y.Doc();
    ydoc.getMap('videoMeta').set('schemaVersion', 1);
    const map = ydoc.getMap('videoOverlays');
    overlays.forEach((o, i) => map.set(String(i), o));
    return ydoc;
  };

  it('picks the earliest clip, the top track on a tie', () => {
    const ydoc = docWith([
      { type: 'video', src: '/api/share/late/preview', from: 90, row: 0 },
      { type: 'video', src: '/api/share/lower/stream', from: 0, row: 2 },
      { type: 'image', src: '/api/share/top/preview', from: 0, row: 1 },
      { type: 'text', from: 0, row: 0 },
    ]);
    expect(videoPosterShareToken(ydoc)).toBe('top');
  });

  it('ignores media from outside the Mediathek and returns null without any', () => {
    expect(
      videoPosterShareToken(
        docWith([{ type: 'image', src: 'https://images.unsplash.com/x', from: 0, row: 0 }])
      )
    ).toBeNull();
    expect(videoPosterShareToken(new Y.Doc())).toBeNull();
  });
});

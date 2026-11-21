import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import { detectPreviewKind } from './contentPreviews.js';

describe('detectPreviewKind: video projects', () => {
  it("returns 'video' for a doc with videoMeta and creates no BlockNote root", () => {
    const ydoc = new Y.Doc();
    ydoc.getMap('videoMeta').set('schemaVersion', 1);
    ydoc.getMap('videoOverlays');

    expect(detectPreviewKind(ydoc)).toBe('video');
    expect(ydoc.share.has('default')).toBe(false);
  });
});

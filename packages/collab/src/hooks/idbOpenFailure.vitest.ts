import { afterEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

// Guards patches/y-indexeddb@9.0.12.patch (GlitchTip #682): a failed IDB open
// must stay a handled rejection of `_db`, not leak through the library's own
// `.then()` chains as an unhandled one.
function stubFailingOpen() {
  vi.stubGlobal('indexedDB', {
    open: () => {
      const request: { onerror?: (event: unknown) => void } = {};
      setTimeout(() =>
        request.onerror?.({
          target: { error: new DOMException('The connection was closed.', 'AbortError') },
        })
      );
      return request;
    },
  });
}

describe('y-indexeddb open failure', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rejects only `_db`, and destroy() still resolves', async () => {
    stubFailingOpen();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);

    try {
      const provider = new IndexeddbPersistence('gruenerator-doc-test', new Y.Doc());
      await expect(provider._db).rejects.toThrow('AbortError: The connection was closed.');
      await expect(provider.destroy()).resolves.toBeUndefined();
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    expect(unhandled).toEqual([]);
  });
});

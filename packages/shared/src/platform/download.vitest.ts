import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  downloadBlob,
  downloadDataUrl,
  exceedsNativeLimit,
  NativeDownloadTooLargeError,
  pickShareRoute,
  registerDesktopSaver,
  shareDataUrlViaNativeHost,
} from './download.js';
import { HOST_CAPABILITIES_GLOBAL, WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH } from './webviewBridge.js';

/**
 * Only the NATIVE path is exercised here, on purpose: it is the branch that
 * never touches `document`, so it runs in this package's node lane without
 * pulling jsdom into `packages/shared` (jsdom is pinned exactly in the root
 * `pnpm.overrides` to keep the copy count down). The anchor branch — including
 * the Firefox append-before-click property — is covered in `apps/web`'s jsdom
 * lane, where those gotchas are already solved.
 */
function withNativeHost(): { posted: string[]; restore: () => void } {
  const posted: string[] = [];
  const original = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    ReactNativeWebView: { postMessage: (m: string) => posted.push(m) },
  };
  return {
    posted,
    restore: () => {
      (globalThis as { window?: unknown }).window = original;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exceedsNativeLimit', () => {
  it('is false at the cap and true one character past it', () => {
    expect(exceedsNativeLimit('A'.repeat(WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH))).toBe(false);
    expect(exceedsNativeLimit('A'.repeat(WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH + 1))).toBe(true);
  });

  it('is false for an empty payload', () => {
    expect(exceedsNativeLimit('')).toBe(false);
  });
});

describe('downloadDataUrl — native host present', () => {
  it('posts the decomposed data URL instead of clicking an anchor', () => {
    const host = withNativeHost();
    try {
      void downloadDataUrl('data:image/png;base64,aGVsbG8=', 'gruenerator-seite-1.png');
      expect(host.posted).toHaveLength(1);
      expect(JSON.parse(host.posted[0] as string)).toEqual({
        type: 'DOWNLOAD_FILE',
        filename: 'gruenerator-seite-1.png',
        mime: 'image/png',
        data: 'aGVsbG8=',
      });
    } finally {
      host.restore();
    }
  });

  it('takes the media type from the URL, not from the file extension', () => {
    // The canvas editor can export jpeg/webp under a name the caller chose;
    // the host picks gallery-vs-share from the mime, so it has to be the real one.
    const host = withNativeHost();
    try {
      void downloadDataUrl('data:image/webp;base64,QQ==', 'bild.png');
      expect(JSON.parse(host.posted[0] as string).mime).toBe('image/webp');
    } finally {
      host.restore();
    }
  });

  it('throws NativeDownloadTooLargeError rather than posting an oversize payload', () => {
    // An oversize string does not fail cleanly on the bridge, it stalls it.
    // Every call site has somewhere to show this; a silent no-op is the exact
    // failure this module exists to end.
    const host = withNativeHost();
    try {
      const huge = 'A'.repeat(WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH + 1);
      expect(() => downloadDataUrl(`data:image/png;base64,${huge}`, 'gross.png')).toThrow(
        NativeDownloadTooLargeError
      );
      expect(host.posted).toHaveLength(0);
    } finally {
      host.restore();
    }
  });

  it('throws on a malformed data URL instead of posting garbage', () => {
    const host = withNativeHost();
    try {
      expect(() => downloadDataUrl('data:image/png,notbase64', 'x.png')).toThrow();
      expect(host.posted).toHaveLength(0);
    } finally {
      host.restore();
    }
  });
});

describe('downloadDataUrl — no native host', () => {
  it('does not post anything when there is no host', () => {
    // `window` is undefined in this lane, so `hasNativeHost()` is false and the
    // anchor branch is taken — which needs a document, hence the throw.
    expect(() => downloadDataUrl('data:image/png;base64,aGVsbG8=', 'x.png')).toThrow();
  });
});

describe('desktop saver registered', () => {
  afterEach(() => registerDesktopSaver(null));

  it('routes downloadBlob through the saver with a sanitised filename', async () => {
    const saver = vi.fn().mockResolvedValue(undefined);
    registerDesktopSaver(saver);
    const blob = new Blob(['x'], { type: 'text/plain' });
    await downloadBlob(blob, 'Protokoll 12/2026.txt');
    expect(saver).toHaveBeenCalledWith(blob, 'Protokoll 12-2026.txt');
  });

  it('routes downloadDataUrl through the saver as a blob', async () => {
    const saver = vi.fn().mockResolvedValue(undefined);
    registerDesktopSaver(saver);
    await downloadDataUrl('data:text/plain;base64,aGVsbG8=', 'a.txt');
    const [blob, name] = saver.mock.calls[0] as [Blob, string];
    expect(name).toBe('a.txt');
    expect(await blob.text()).toBe('hello');
  });
});

describe('pickShareRoute', () => {
  const host = { ReactNativeWebView: { postMessage: () => {} } };
  const original = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = original;
    vi.unstubAllGlobals();
  });

  it('prefers the Web Share API where the browser has one', () => {
    vi.stubGlobal('navigator', { share: () => Promise.resolve() });
    (globalThis as { window?: unknown }).window = {
      ...host,
      [HOST_CAPABILITIES_GLOBAL]: ['share'],
    };
    expect(pickShareRoute()).toBe('web-share');
  });

  it('falls back to the native host when it announced share (Android System WebView)', () => {
    vi.stubGlobal('navigator', {});
    (globalThis as { window?: unknown }).window = {
      ...host,
      [HOST_CAPABILITIES_GLOBAL]: ['share'],
    };
    expect(pickShareRoute()).toBe('native-host');
  });

  it('offers no share on an older host that announced nothing', () => {
    vi.stubGlobal('navigator', {});
    (globalThis as { window?: unknown }).window = host;
    expect(pickShareRoute()).toBeNull();
  });
});

describe('shareDataUrlViaNativeHost', () => {
  it('posts a SHARE_FILE with a sanitised name and the data URL split apart', () => {
    const { posted, restore } = withNativeHost();
    try {
      shareDataUrlViaNativeHost('data:image/png;base64,aGVsbG8=', 'Seite 1/2.png', {
        title: 'Grünerator Share',
      });
      expect(posted.map((m) => JSON.parse(m))).toEqual([
        {
          type: 'SHARE_FILE',
          filename: 'Seite 1-2.png',
          mime: 'image/png',
          data: 'aGVsbG8=',
          title: 'Grünerator Share',
        },
      ]);
    } finally {
      restore();
    }
  });

  it('throws instead of posting over the bridge cap', () => {
    const { posted, restore } = withNativeHost();
    try {
      const huge = `data:image/png;base64,${'A'.repeat(WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH + 1)}`;
      expect(() => shareDataUrlViaNativeHost(huge, 'a.png')).toThrow(NativeDownloadTooLargeError);
      expect(posted).toEqual([]);
    } finally {
      restore();
    }
  });
});

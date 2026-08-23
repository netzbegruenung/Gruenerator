/**
 * The two branches of handing a file to the user.
 *
 * `.tsx` purely to select `apps/web`'s jsdom lane — there is no JSX in here.
 * This is the only place both branches are measured: `packages/shared`'s node
 * lane can cover the native path (it never touches `document`) but not the
 * anchor path, and adding jsdom to that package would mean a second pinned copy.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from './downloadFile';

function setNativeHost(): string[] {
  const posted: string[] = [];
  (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView = {
    postMessage: (m: string) => posted.push(m),
  };
  return posted;
}

afterEach(() => {
  delete (window as unknown as { ReactNativeWebView?: unknown }).ReactNativeWebView;
  vi.restoreAllMocks();
});

describe('downloadBlob — browser', () => {
  it('appends the anchor before clicking it', async () => {
    // Firefox ignores a synthetic click on a detached node. The board CSV
    // export used to get this wrong; the shared helper is where it stays right.
    let attachedAtClick: boolean | null = null;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      attachedAtClick = this.isConnected;
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    await downloadBlob(new Blob(['x'], { type: 'text/csv' }), 'board.csv');

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(attachedAtClick).toBe(true);
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    // And it does not leave the anchor behind.
    expect(document.querySelectorAll('a[download]')).toHaveLength(0);
  });
});

describe('downloadBlob — native host', () => {
  it('posts the bytes to the host and creates no anchor at all', async () => {
    // The whole point: inside the app's WebView an anchor click does nothing,
    // so taking that branch would be a silent no-op.
    const posted = setNativeHost();
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    await downloadBlob(new Blob(['hello'], { type: 'text/csv' }), 'board.csv');

    expect(clickSpy).not.toHaveBeenCalled();
    expect(posted).toHaveLength(1);
    const message = JSON.parse(posted[0] as string) as Record<string, unknown>;
    expect(message.type).toBe('DOWNLOAD_FILE');
    expect(message.filename).toBe('board.csv');
    expect(message.mime).toBe('text/csv');
    // `hello` in base64 — proof the payload survived the FileReader round trip.
    expect(message.data).toBe('aGVsbG8=');
  });
});

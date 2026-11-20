/// <reference lib="dom" />

/**
 * Handing a file to the user — the one place that decides *how*.
 *
 * In a browser that means a synthetic `<a download>` click. Inside the mobile
 * app's WebView it cannot: WKWebView silently ignores such a click, and on
 * Android our own navigation policy blocks the `data:` scheme
 * (`apps/mobile/services/webview/navigationPolicy.ts`). So every export from an
 * embedded page used to do nothing at all. Here the same call posts the bytes
 * to the native host instead, which writes them to the gallery or opens the
 * share sheet.
 *
 * The gate is `hasNativeHost()`, NOT `isEmbedded()`. The question is "is there
 * a host that can receive bytes", which is a capability; `isEmbedded()` answers
 * "should the page hide its chrome", which merely correlates. Using the
 * capability also covers `/mobile-editor`, the second WebView host, which is
 * not opened with `?embedded=1`.
 */

import { parseDataUrl } from '../utils/dataUrl.js';

import {
  FILE_TRANSFER_CHUNK_BYTES,
  hasNativeHost,
  HOST_CAPABILITY_FILE_TRANSFER,
  HOST_CAPABILITY_SHARE,
  hostSupports,
  parseHostMessage,
  postToNativeHost,
  sanitizeDownloadFilename,
  WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH,
} from './webviewBridge.js';

/**
 * Thrown when a file is too large to hand across the WebView bridge.
 *
 * A named error rather than a silent no-op: the call sites all have somewhere
 * to show it (an `exportError`, a `.catch()`), and a export that quietly does
 * nothing is the exact failure this module exists to end.
 */
export class NativeDownloadTooLargeError extends Error {
  constructor() {
    super('Die Datei ist zu groß, um sie in der App zu speichern.');
    this.name = 'NativeDownloadTooLargeError';
  }
}

/**
 * Saves a blob through the desktop shell's native save dialog.
 *
 * Injected rather than imported: this package is also bundled for the mobile
 * app, which has no `@tauri-apps/*` packages for Metro to resolve. `apps/web`
 * registers the implementation at startup when it runs inside Tauri, and every
 * consumer of `downloadBlob` (chat, canvas editor, web features) gets it for
 * free. The Tauri webview silently ignores a synthetic `<a download>` click,
 * so without a saver the export does nothing.
 */
export type DesktopSaver = (blob: Blob, filename: string) => Promise<void>;

let desktopSaver: DesktopSaver | null = null;

export function registerDesktopSaver(saver: DesktopSaver | null): void {
  desktopSaver = saver;
}

/** Thrown when the host refused or stopped answering a transfer in pieces. */
export class NativeTransferFailedError extends Error {
  constructor(reason: string) {
    super('Die Datei konnte nicht an die App übergeben werden.');
    this.name = 'NativeTransferFailedError';
    this.cause = reason;
  }
}

/** How long the page waits for the host to acknowledge one chunk. */
const FILE_TRANSFER_ACK_TIMEOUT_MS = 30_000;

/** True when this base64 payload would exceed what the bridge accepts. */
export function exceedsNativeLimit(base64: string): boolean {
  return base64.length > WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH;
}

/**
 * How long an object URL outlives its click. Chrome on Android hands the click
 * to its download manager, which reads the URL only afterwards — revoked in the
 * same tick, the download vanishes without an error.
 */
const OBJECT_URL_TTL_MS = 60_000;

/** The browser path: a real anchor click. */
function clickAnchor(href: string, filename: string, revoke: boolean): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  // Appended before the click on purpose: Firefox ignores a synthetic click on
  // a detached node.
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (revoke) setTimeout(() => URL.revokeObjectURL(href), OBJECT_URL_TTL_MS);
}

function postToHost(base64: string, mime: string, filename: string): void {
  if (exceedsNativeLimit(base64)) throw new NativeDownloadTooLargeError();
  // Sanitised here rather than at each call site: most filenames are built
  // from a user-typed title (`${docData.title}.docx`), and a title with a `/`
  // in it — `Protokoll 12/2026` — is ordinary. The host's parser rejects the
  // whole message for such a name, and since posting is not a round trip the
  // export would fail without anything to show for it. Two call sites already
  // sanitise (`toXlsxFilename`, the board's `slug()`); the rest cannot forget
  // now.
  postToNativeHost({
    type: 'DOWNLOAD_FILE',
    filename: sanitizeDownloadFilename(filename),
    mime,
    data: base64,
  });
}

/**
 * Base64 of one chunk. Through `arrayBuffer` rather than FileReader so it also
 * runs in the node test lane; `btoa` over 32 KiB pieces keeps the intermediate
 * string small (and a multiple of 3, so the pieces concatenate without padding).
 */
async function chunkToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let base64 = '';
  const step = 3 * 1024 * 11;
  for (let i = 0; i < bytes.length; i += step) {
    base64 += btoa(String.fromCharCode(...bytes.subarray(i, i + step)));
  }
  return base64;
}

/**
 * The host's answers to one transfer: `waitFor(n)` resolves once the host has
 * acknowledged `n` chunks and rejects on `FILE_TRANSFER_FAILED` or silence.
 */
function hostAcks(transferId: string) {
  let received = -1;
  let failure: string | null = null;
  let wake: (() => void) | null = null;
  const onMessage = (event: Event) => {
    const message = parseHostMessage((event as MessageEvent).data);
    if (message === null || !('transferId' in message) || message.transferId !== transferId) {
      return;
    }
    if (message.type === 'FILE_TRANSFER_ACK') received = Math.max(received, message.received);
    if (message.type === 'FILE_TRANSFER_FAILED') failure = message.reason;
    wake?.();
  };
  // react-native-webview delivers to `document` on Android, `window` on iOS.
  window.addEventListener('message', onMessage);
  document.addEventListener('message', onMessage);

  return {
    waitFor(count: number): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          wake = null;
          reject(new NativeTransferFailedError('ack timeout'));
        }, FILE_TRANSFER_ACK_TIMEOUT_MS);
        const check = () => {
          if (failure === null && received < count) return;
          clearTimeout(timer);
          wake = null;
          if (failure !== null) reject(new NativeTransferFailedError(failure));
          else resolve();
        };
        wake = check;
        check();
      });
    },
    dispose() {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('message', onMessage);
    },
  };
}

/**
 * Hands a blob to the host in acknowledged pieces, for files one
 * `DOWNLOAD_FILE` cannot carry. One chunk is in flight at a time, so neither
 * side ever holds more than a chunk of base64 — the page reads each slice only
 * when the host is ready for it.
 */
async function transferInChunks(blob: Blob, filename: string, mime: string): Promise<void> {
  const transferId = crypto.randomUUID();
  const acks = hostAcks(transferId);
  try {
    postToNativeHost({ type: 'FILE_TRANSFER_BEGIN', transferId, filename, mime, size: blob.size });
    await acks.waitFor(0);
    const chunks = Math.ceil(blob.size / FILE_TRANSFER_CHUNK_BYTES);
    for (let index = 0; index < chunks; index++) {
      const start = index * FILE_TRANSFER_CHUNK_BYTES;
      const data = await chunkToBase64(blob.slice(start, start + FILE_TRANSFER_CHUNK_BYTES));
      postToNativeHost({ type: 'FILE_TRANSFER_CHUNK', transferId, index, data });
      await acks.waitFor(index + 1);
    }
    postToNativeHost({ type: 'FILE_TRANSFER_END', transferId });
    // The host answers END with one ack past the last chunk once the file is
    // complete on disk; a refusal arrives as FAILED and rejects here.
    await acks.waitFor(chunks + 1);
  } catch (error) {
    postToNativeHost({ type: 'FILE_TRANSFER_ABORT', transferId });
    throw error;
  } finally {
    acks.dispose();
  }
}

/** Base64 length of `bytes` raw bytes. */
const base64Length = (bytes: number) => Math.ceil(bytes / 3) * 4;

/**
 * Hands a base64 data URL to the user.
 *
 * Separate from {@link downloadBlob} because the canvas editor already holds a
 * data URL: routing it through a Blob would decode and re-encode several MB for
 * nothing.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void | Promise<void> {
  if (desktopSaver) {
    const save = desktopSaver;
    return fetch(dataUrl)
      .then((res) => res.blob())
      .then((blob) => save(blob, sanitizeDownloadFilename(filename)));
  }
  if (!hasNativeHost()) {
    clickAnchor(dataUrl, filename, false);
    return;
  }
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error('downloadDataUrl: kein wohlgeformter base64-Data-URL');
  postToHost(parsed.base64, parsed.mediaType, filename);
}

/**
 * Hands a Blob to the user.
 *
 * Async because the native path has to read the blob out; the browser path
 * resolves immediately. Callers that do not care may `void` the result — none
 * of them sequence anything after the download.
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  if (desktopSaver) {
    await desktopSaver(blob, sanitizeDownloadFilename(filename));
    return;
  }
  if (!hasNativeHost()) {
    clickAnchor(URL.createObjectURL(blob), filename, true);
    return;
  }
  // In pieces only what one message cannot carry: everything smaller keeps the
  // path every shipped binary understands.
  if (
    base64Length(blob.size) > WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH &&
    hostSupports(HOST_CAPABILITY_FILE_TRANSFER)
  ) {
    const mime = blob.type || 'application/octet-stream';
    await transferInChunks(blob, sanitizeDownloadFilename(filename), mime);
    return;
  }
  // readAsDataURL rather than btoa over a binary string: btoa doubles the
  // string and mangles anything outside latin1.
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Die Datei konnte nicht gelesen werden.'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(blob);
  });
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error('downloadBlob: FileReader lieferte keinen base64-Data-URL');
  postToHost(parsed.base64, blob.type || parsed.mediaType, filename);
}

/** Hands text content to the user as a file. */
export async function downloadFile(content: string, filename: string, mime: string): Promise<void> {
  await downloadBlob(new Blob([content], { type: mime }), filename);
}

/**
 * How this page can open a share sheet, or `null` when it cannot. Android's
 * System WebView has no `navigator.share`, so inside the app the host's share
 * sheet is the only way — but only on a binary that announced it.
 */
export function pickShareRoute(): 'web-share' | 'native-host' | null {
  if (typeof navigator !== 'undefined' && 'share' in navigator) return 'web-share';
  if (hostSupports(HOST_CAPABILITY_SHARE)) return 'native-host';
  return null;
}

/**
 * Asks the native host to share a base64 data URL as a file. Throws
 * {@link NativeDownloadTooLargeError} over the bridge cap.
 */
export function shareDataUrlViaNativeHost(
  dataUrl: string,
  filename: string,
  options: { title?: string; text?: string } = {}
): void {
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) throw new Error('shareDataUrlViaNativeHost: kein wohlgeformter base64-Data-URL');
  if (exceedsNativeLimit(parsed.base64)) throw new NativeDownloadTooLargeError();
  postToNativeHost({
    type: 'SHARE_FILE',
    filename: sanitizeDownloadFilename(filename),
    mime: parsed.mediaType,
    data: parsed.base64,
    ...(options.title !== undefined && { title: options.title }),
    ...(options.text !== undefined && { text: options.text }),
  });
}

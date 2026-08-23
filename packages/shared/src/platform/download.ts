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
  hasNativeHost,
  postToNativeHost,
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

/** True when this base64 payload would exceed what the bridge accepts. */
export function exceedsNativeLimit(base64: string): boolean {
  return base64.length > WEBVIEW_DOWNLOAD_MAX_BASE64_LENGTH;
}

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
  if (revoke) URL.revokeObjectURL(href);
}

function postToHost(base64: string, mime: string, filename: string): void {
  if (exceedsNativeLimit(base64)) throw new NativeDownloadTooLargeError();
  postToNativeHost({ type: 'DOWNLOAD_FILE', filename, mime, data: base64 });
}

/**
 * Hands a base64 data URL to the user.
 *
 * Separate from {@link downloadBlob} because the canvas editor already holds a
 * data URL: routing it through a Blob would decode and re-encode several MB for
 * nothing.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
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
  if (!hasNativeHost()) {
    clickAnchor(URL.createObjectURL(blob), filename, true);
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

// SPDX-License-Identifier: MPL-2.0
import { messages } from '@ggraphic/editor/i18n/messages';

// The host's file delivery (`CanvasFileDeliveryService`) throws an error named
// 'NativeDownloadTooLargeError' when the WebView bridge refuses the payload
// (the host's `NativeDownloadTooLargeError` sets that name). Matched by
// name, not class, so the editor needs no import from the host.
export function isDownloadTooLarge(err: unknown): boolean {
  return err instanceof Error && err.name === 'NativeDownloadTooLargeError';
}

export function downloadErrorMessage(err: unknown): string {
  const m = messages().errors;
  return isDownloadTooLarge(err) ? m.downloadTooLarge : m.downloadFailed;
}

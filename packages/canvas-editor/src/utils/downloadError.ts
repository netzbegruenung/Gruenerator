export const DOWNLOAD_TOO_LARGE_NOTICE =
  'Die Datei ist zu groß für die App. Bitte lade die Seiten einzeln herunter.';

// The host's file delivery (`CanvasFileDeliveryService`) throws an error named
// 'NativeDownloadTooLargeError' when the WebView bridge refuses the payload
// (@gruenerator/shared's `NativeDownloadTooLargeError` sets that name). Matched by
// name, not class, so the editor needs no import from the host.
export function isDownloadTooLarge(err: unknown): boolean {
  return err instanceof Error && err.name === 'NativeDownloadTooLargeError';
}

export function downloadErrorMessage(err: unknown): string {
  return isDownloadTooLarge(err) ? DOWNLOAD_TOO_LARGE_NOTICE : 'Der Download ist fehlgeschlagen.';
}

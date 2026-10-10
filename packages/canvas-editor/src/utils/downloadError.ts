import { NativeDownloadTooLargeError } from '@gruenerator/shared';

export const DOWNLOAD_TOO_LARGE_NOTICE =
  'Die Datei ist zu groß für die App. Bitte lade die Seiten einzeln herunter.';

// The name check covers a second bundled copy of the shared package, where
// instanceof fails.
export function isDownloadTooLarge(err: unknown): boolean {
  return (
    err instanceof NativeDownloadTooLargeError ||
    (err instanceof Error && err.name === 'NativeDownloadTooLargeError')
  );
}

export function downloadErrorMessage(err: unknown): string {
  return isDownloadTooLarge(err) ? DOWNLOAD_TOO_LARGE_NOTICE : 'Der Download ist fehlgeschlagen.';
}

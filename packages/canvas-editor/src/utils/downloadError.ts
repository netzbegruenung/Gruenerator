import { NativeDownloadTooLargeError } from '@gruenerator/shared';

export const DOWNLOAD_TOO_LARGE_NOTICE =
  'Die Datei ist zu groß für die App. Bitte lade die Seiten einzeln herunter.';

export function downloadErrorMessage(err: unknown): string {
  if (err instanceof NativeDownloadTooLargeError) return DOWNLOAD_TOO_LARGE_NOTICE;
  return 'Der Download ist fehlgeschlagen.';
}

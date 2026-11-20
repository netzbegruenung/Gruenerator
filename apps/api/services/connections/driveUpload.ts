/**
 * Export einer Word-Datei in ein verbundenes Laufwerk, in einer Form für beide
 * Anbieter. Google bekommt ein Google-Doc (Scope `drive.file` erlaubt das
 * Anlegen), OneDrive eine .docx im Ordner „Grünerator“ (Scope `Files.ReadWrite`).
 */
import { type DriveProvider } from '@gruenerator/contracts';

import * as googleDriveClient from '../api-clients/googleDriveClient.js';
import * as microsoftGraphClient from '../api-clients/microsoftGraphClient.js';

export interface DriveUploadResult {
  name: string;
  webUrl: string;
}

/** Eine .docx ist ein ZIP-Archiv: die ersten Bytes sind `PK\x03\x04`. */
export function isDocxBuffer(buffer: Buffer): boolean {
  return (
    buffer.length > 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

const MAX_TITLE_LENGTH = 120;

/**
 * Titel ohne Endung, ohne Zeichen, die OneDrive in Dateinamen ablehnt.
 * Leer → „Dokument“.
 */
export function exportTitle(originalName: string): string {
  const title = originalName
    .replace(/\.docx$/i, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|#%\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .slice(0, MAX_TITLE_LENGTH)
    .trim();
  return title || 'Dokument';
}

export async function uploadToDrive(
  provider: DriveProvider,
  accessToken: string,
  docx: Buffer,
  originalName: string
): Promise<DriveUploadResult> {
  const title = exportTitle(originalName);
  if (provider === 'google') {
    const file = await googleDriveClient.uploadDocxAsGoogleDoc(accessToken, docx, title);
    if (!file.webViewLink) throw new Error('Google Drive returned no webViewLink');
    return { name: file.name, webUrl: file.webViewLink };
  }
  const item = await microsoftGraphClient.uploadToMyDrive(accessToken, docx, `${title}.docx`);
  if (!item.webUrl) throw new Error('Graph returned no webUrl');
  return { name: item.name, webUrl: item.webUrl };
}

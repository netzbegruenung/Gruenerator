/**
 * Handing in-memory bytes to the user.
 *
 * `downloadBlob` lived here as a second copy of the same objectURL +
 * synthetic-`<a download>` pattern that `apps/web` and the canvas editor also
 * carried. It now comes from `@gruenerator/shared`, which additionally knows
 * that the anchor does nothing inside the mobile app's WebView. The chat UI is
 * not reachable through that WebView today — this is de-duplication, not a fix
 * — but a third divergent copy is how the first two got it wrong.
 */
import { downloadBlob } from '@gruenerator/shared';

export { downloadBlob };

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export async function downloadBase64(
  base64: string,
  filename: string,
  mimeType: string
): Promise<void> {
  await downloadBlob(base64ToBlob(base64, mimeType), filename);
}

const MIME_BY_EXTENSION: Record<string, string> = {
  csv: 'text/csv',
  json: 'application/json',
  txt: 'text/plain',
  md: 'text/markdown',
  png: 'image/png',
  svg: 'image/svg+xml',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  pdf: 'application/pdf',
};

export function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'application/octet-stream';
}

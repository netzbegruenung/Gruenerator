import { type NotebookDocumentRecord } from '@gruenerator/contracts';

import apiClient from '../../../../components/utils/apiClient';

/** Der Dateiname aus `Content-Disposition`, bevorzugt die UTF-8-Form. */
export function filenameFromDisposition(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // fall through to the plain form
    }
  }
  return /filename="([^"]+)"/i.exec(header)?.[1] ?? null;
}

/**
 * Lädt das Original einer Quelle herunter. Über den `apiClient` statt eines
 * Links, damit die Anfrage dieselbe Anmeldung trägt wie jede andere.
 */
export async function downloadOriginal(
  doc: NotebookDocumentRecord,
  notebookId: string
): Promise<void> {
  const res = await apiClient.get<Blob>(`/documents/${doc.id}/original`, {
    params: { notebookId },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filenameFromDisposition(res.headers['content-disposition']) ?? doc.title;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

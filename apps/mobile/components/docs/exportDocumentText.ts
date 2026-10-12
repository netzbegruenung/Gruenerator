import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function exportDocumentText(
  documentId: string,
  title: string | null,
  format: 'markdown' | 'text',
  token: string
): Promise<void> {
  const API_BASE_URL = process.env.EXPO_PUBLIC_DOCS_API_URL || 'https://gruenerator.eu/api';
  const res = await fetch(`${API_BASE_URL}/docs/${documentId}/export/${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Export fehlgeschlagen');
  const content = await res.text();
  const ext = format === 'markdown' ? 'md' : 'txt';
  const safeTitle = (title || 'Dokument').replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '_');
  const file = new File(Paths.cache, `${safeTitle}.${ext}`);
  file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType: 'text/plain' });
}

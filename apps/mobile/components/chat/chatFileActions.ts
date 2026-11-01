import { useChatConfigStore } from '@gruenerator/chat';
import { File, Paths } from 'expo-file-system';

import { secureStorage } from '../../services/storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://gruenerator.eu/api';

export async function fetchAssetBytes(url: string): Promise<Uint8Array> {
  const { fetch: configFetch } = useChatConfigStore.getState();
  const response = await configFetch(url, { method: 'GET' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function downloadDocumentPdf(document: {
  url: string;
  documentId?: string | null;
}): Promise<File> {
  const token = await secureStorage.getToken();
  // document.url is API-relative (/api/chat-service/…); API_BASE_URL already
  // carries the /api suffix.
  const url = `${API_BASE_URL.replace(/\/api\/?$/, '')}${document.url}`;
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Download fehlgeschlagen (${response.status})`);

  // documentId for pdf subtypes IS the stored file name (uuid.pdf).
  const fileName = document.documentId?.endsWith('.pdf')
    ? document.documentId
    : `${document.documentId || 'gruenerator'}.pdf`;
  const file = new File(Paths.cache, fileName);
  file.writeSync(new Uint8Array(await response.arrayBuffer()));
  return file;
}

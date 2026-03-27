import { fetch as expoFetch } from 'expo/fetch';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { apiRequest } from '@gruenerator/shared/api';

const API_BASE_URL = process.env.EXPO_PUBLIC_DOCS_API_URL || 'https://docs.gruenerator.eu/api';

export interface Document {
  id: string;
  title: string;
  content?: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDocumentPayload {
  title: string;
  content?: string;
  document_subtype?: string;
}

export interface UpdateDocumentPayload {
  title?: string;
  content?: string;
}

export type ExportFormat = 'docx' | 'pdf';

const ENDPOINTS = {
  LIST: '/docs',
  GET: (id: string) => `/docs/${id}`,
  CREATE: '/docs',
  UPDATE: (id: string) => `/docs/${id}`,
  DELETE: (id: string) => `/docs/${id}`,
} as const;

const MIME_TYPES: Record<ExportFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

const FILE_EXTENSIONS: Record<ExportFormat, string> = {
  docx: 'docx',
  pdf: 'pdf',
};

async function fetchWithAuth(
  url: string,
  token: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<Response> {
  return expoFetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
}

async function assertOk(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  let detail = '';
  try {
    const body = await res.text();
    const json = JSON.parse(body);
    detail = json.message || json.error || body.slice(0, 200);
  } catch {
    /* ignore parse errors */
  }
  throw new Error(`${label} (${res.status}${detail ? `: ${detail}` : ''})`);
}

export async function exportDocument(
  docId: string,
  title: string,
  format: ExportFormat,
  token: string
): Promise<void> {
  const htmlRes = await fetchWithAuth(`${API_BASE_URL}/docs/${docId}/export/html`, token);
  await assertOk(htmlRes, 'HTML-Export fehlgeschlagen');
  const html = await htmlRes.text();

  const convertRes = await fetchWithAuth(`${API_BASE_URL}/exports/${format}`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: html, title }),
  });
  await assertOk(convertRes, `${format.toUpperCase()}-Export fehlgeschlagen`);
  const bytes = new Uint8Array(await convertRes.arrayBuffer());

  const safeTitle = title.replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '_') || 'Dokument';
  const ext = FILE_EXTENSIONS[format];
  const file = new File(Paths.cache, `${safeTitle}.${ext}`);
  file.write(bytes);

  await Sharing.shareAsync(file.uri, { mimeType: MIME_TYPES[format] });
}

export const docsService = {
  async fetchDocuments(): Promise<Document[]> {
    const response = await apiRequest<Document[]>('get', ENDPOINTS.LIST);
    return response || [];
  },

  async fetchDocument(id: string): Promise<Document | null> {
    const response = await apiRequest<Document>('get', ENDPOINTS.GET(id));
    return response || null;
  },

  async createDocument(payload: CreateDocumentPayload): Promise<Document | null> {
    const response = await apiRequest<Document>('post', ENDPOINTS.CREATE, payload);
    return response || null;
  },

  async updateDocument(id: string, payload: UpdateDocumentPayload): Promise<Document | null> {
    const response = await apiRequest<Document>('put', ENDPOINTS.UPDATE(id), payload);
    return response || null;
  },

  async deleteDocument(id: string): Promise<boolean> {
    try {
      await apiRequest<void>('delete', ENDPOINTS.DELETE(id));
      return true;
    } catch (error) {
      console.error('[DocsService] Failed to delete document:', error);
      return false;
    }
  },
};

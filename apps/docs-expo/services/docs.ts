import { apiRequest } from '@gruenerator/shared/api';

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
}

export interface UpdateDocumentPayload {
  title?: string;
  content?: string;
}

const ENDPOINTS = {
  LIST: '/docs',
  GET: (id: string) => `/docs/${id}`,
  CREATE: '/docs',
  UPDATE: (id: string) => `/docs/${id}`,
  DELETE: (id: string) => `/docs/${id}`,
} as const;

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

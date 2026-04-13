import axios from 'axios';

import {
  googleDriveFileListResponseSchema,
  googleDriveFileSchema,
  googleDriveSearchResponseSchema,
  googleDocsDocumentSchema,
  googleSheetsResponseSchema,
  type GoogleDriveFile,
} from './schemas/google.js';

export type { GoogleDriveFile } from './schemas/google.js';

const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DOCS_API = 'https://docs.googleapis.com/v1';
const GOOGLE_SHEETS_API = 'https://sheets.googleapis.com/v4';

export interface GoogleDriveListResult {
  files: GoogleDriveFile[];
  nextPageToken: string | null;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const DRIVE_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function validateDriveId(id: string, label: string): string {
  if (!DRIVE_ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${label} format`);
  }
  return id;
}

export async function listFiles(
  token: string,
  folderId?: string,
  pageToken?: string
): Promise<GoogleDriveListResult> {
  if (folderId) validateDriveId(folderId, 'folder ID');
  const query = folderId ? `'${folderId}' in parents and trashed = false` : 'trashed = false';
  const response = await axios.get(`${GOOGLE_DRIVE_API}/files`, {
    headers: authHeaders(token),
    params: {
      q: query,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink)',
      pageSize: 50,
      pageToken,
      orderBy: 'folder,name',
    },
  });
  const parsed = googleDriveFileListResponseSchema.parse(response.data);
  return {
    files: parsed.files,
    nextPageToken: parsed.nextPageToken ?? null,
  };
}

export async function getFile(token: string, fileId: string): Promise<GoogleDriveFile> {
  validateDriveId(fileId, 'file ID');
  const response = await axios.get(`${GOOGLE_DRIVE_API}/files/${fileId}`, {
    headers: authHeaders(token),
    params: {
      fields: 'id,name,mimeType,size,modifiedTime,parents,webViewLink',
    },
  });
  return googleDriveFileSchema.parse(response.data);
}

export async function downloadFile(token: string, fileId: string): Promise<Buffer> {
  validateDriveId(fileId, 'file ID');
  const response = await axios.get(`${GOOGLE_DRIVE_API}/files/${fileId}`, {
    headers: authHeaders(token),
    params: { alt: 'media' },
    responseType: 'arraybuffer',
  });
  return Buffer.from(response.data);
}

export async function exportDoc(
  token: string,
  docId: string,
  mimeType: string = 'text/plain'
): Promise<string> {
  validateDriveId(docId, 'document ID');
  const response = await axios.get(`${GOOGLE_DRIVE_API}/files/${docId}/export`, {
    headers: authHeaders(token),
    params: { mimeType },
  });
  if (typeof response.data !== 'string') {
    throw new Error('Unexpected non-string response from Google Drive export');
  }
  return response.data;
}

export async function getDocContent(
  token: string,
  docId: string
): Promise<Record<string, unknown>> {
  validateDriveId(docId, 'document ID');
  const response = await axios.get(`${GOOGLE_DOCS_API}/documents/${docId}`, {
    headers: authHeaders(token),
  });
  return googleDocsDocumentSchema.parse(response.data);
}

export async function getSheetContent(
  token: string,
  spreadsheetId: string,
  range?: string
): Promise<Record<string, unknown>> {
  validateDriveId(spreadsheetId, 'spreadsheet ID');
  const url = range
    ? `${GOOGLE_SHEETS_API}/spreadsheets/${spreadsheetId}/values/${range}`
    : `${GOOGLE_SHEETS_API}/spreadsheets/${spreadsheetId}`;
  const response = await axios.get(url, {
    headers: authHeaders(token),
  });
  return googleSheetsResponseSchema.parse(response.data);
}

export async function searchFiles(token: string, query: string): Promise<GoogleDriveFile[]> {
  const sanitized = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const response = await axios.get(`${GOOGLE_DRIVE_API}/files`, {
    headers: authHeaders(token),
    params: {
      q: `fullText contains '${sanitized}' and trashed = false`,
      fields: 'files(id,name,mimeType,size,modifiedTime,parents,webViewLink)',
      pageSize: 20,
    },
  });
  return googleDriveSearchResponseSchema.parse(response.data).files;
}

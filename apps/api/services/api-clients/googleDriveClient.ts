import axios from 'axios';

const GOOGLE_DRIVE_API = 'https://www.googleapis.com/drive/v3';
const GOOGLE_DOCS_API = 'https://docs.googleapis.com/v1';
const GOOGLE_SHEETS_API = 'https://sheets.googleapis.com/v4';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: string | null;
  modifiedTime: string;
  parents: string[] | null;
  webViewLink: string | null;
}

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
  const response = await axios.get<{ files: GoogleDriveFile[]; nextPageToken?: string }>(`${GOOGLE_DRIVE_API}/files`, {
    headers: authHeaders(token),
    params: {
      q: query,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink)',
      pageSize: 50,
      pageToken,
      orderBy: 'folder,name',
    },
  });
  return {
    files: response.data.files,
    nextPageToken: response.data.nextPageToken ?? null,
  };
}

export async function getFile(token: string, fileId: string): Promise<GoogleDriveFile> {
  validateDriveId(fileId, 'file ID');
  const response = await axios.get<GoogleDriveFile>(`${GOOGLE_DRIVE_API}/files/${fileId}`, {
    headers: authHeaders(token),
    params: {
      fields: 'id,name,mimeType,size,modifiedTime,parents,webViewLink',
    },
  });
  return response.data;
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
  const response = await axios.get<string>(`${GOOGLE_DRIVE_API}/files/${docId}/export`, {
    headers: authHeaders(token),
    params: { mimeType },
  });
  return response.data;
}

export async function getDocContent(
  token: string,
  docId: string
): Promise<Record<string, unknown>> {
  validateDriveId(docId, 'document ID');
  const response = await axios.get<Record<string, unknown>>(
    `${GOOGLE_DOCS_API}/documents/${docId}`,
    { headers: authHeaders(token) }
  );
  return response.data;
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
  const response = await axios.get<Record<string, unknown>>(url, {
    headers: authHeaders(token),
  });
  return response.data;
}

export async function searchFiles(token: string, query: string): Promise<GoogleDriveFile[]> {
  const sanitized = query.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const response = await axios.get<{ files: GoogleDriveFile[] }>(`${GOOGLE_DRIVE_API}/files`, {
    headers: authHeaders(token),
    params: {
      q: `fullText contains '${sanitized}' and trashed = false`,
      fields: 'files(id,name,mimeType,size,modifiedTime,parents,webViewLink)',
      pageSize: 20,
    },
  });
  return response.data.files;
}

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

/** Per-folder cap; past it `nextPageToken` stays set. */
const MAX_LIST_FILES = 1000;

/**
 * Lists one folder; without `folderId` the top level of "My Drive" — not every
 * file the account can see. Follows `nextPageToken` up to the cap.
 */
export async function listFiles(token: string, folderId?: string): Promise<GoogleDriveListResult> {
  const parent = folderId ? validateDriveId(folderId, 'folder ID') : 'root';
  const files: GoogleDriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const response = await axios.get(`${GOOGLE_DRIVE_API}/files`, {
      headers: authHeaders(token),
      params: {
        q: `'${parent}' in parents and trashed = false`,
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink)',
        pageSize: 200,
        pageToken,
        orderBy: 'folder,name',
      },
    });
    const parsed = googleDriveFileListResponseSchema.parse(response.data);
    files.push(...parsed.files);
    pageToken = parsed.nextPageToken;
  } while (pageToken && files.length < MAX_LIST_FILES);
  return { files, nextPageToken: pageToken ?? null };
}

const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Drive query literals: backslash and single quote are escaped. */
function escapeQueryLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Every non-folder file this app can see. With scope `drive.file` that is only
 * what the person picked in the Google Picker or the app created — there is no
 * folder tree to walk. https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list
 */
export async function listAccessibleFiles(
  token: string,
  options: { nameContains?: string } = {}
): Promise<GoogleDriveListResult> {
  const clauses = ['trashed = false', `mimeType != '${GOOGLE_FOLDER_MIME}'`];
  if (options.nameContains) {
    clauses.push(`name contains '${escapeQueryLiteral(options.nameContains)}'`);
  }
  const files: GoogleDriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const response = await axios.get(`${GOOGLE_DRIVE_API}/files`, {
      headers: authHeaders(token),
      params: {
        q: clauses.join(' and '),
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webViewLink)',
        pageSize: 200,
        pageToken,
        orderBy: 'modifiedTime desc',
      },
    });
    const parsed = googleDriveFileListResponseSchema.parse(response.data);
    files.push(...parsed.files);
    pageToken = parsed.nextPageToken;
  } while (pageToken && files.length < MAX_LIST_FILES);
  return { files, nextPageToken: pageToken ?? null };
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

const GOOGLE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';

/**
 * Legt aus einer .docx ein Google-Doc in „Meine Ablage“ an. Unter `drive.file`
 * darf die App Dateien anlegen; danach sieht sie genau diese wieder.
 */
export async function uploadDocxAsGoogleDoc(
  token: string,
  docx: Buffer,
  title: string
): Promise<GoogleDriveFile> {
  const boundary = `gruenerator-${Date.now().toString(36)}`;
  const metadata = JSON.stringify({ name: title, mimeType: GOOGLE_DOC_MIME });
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
        `--${boundary}\r\nContent-Type: ${DOCX_MIME}\r\n\r\n`
    ),
    docx,
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const response = await axios.post(GOOGLE_UPLOAD_API, body, {
    headers: {
      ...authHeaders(token),
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    params: {
      uploadType: 'multipart',
      fields: 'id,name,mimeType,size,modifiedTime,parents,webViewLink',
    },
    maxBodyLength: Infinity,
  });
  return googleDriveFileSchema.parse(response.data);
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

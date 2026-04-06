import axios, { type AxiosInstance } from 'axios';

export interface WebDAVCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

export interface WebDAVFile {
  href: string;
  name: string;
  size: number | null;
  lastModified: Date | null;
  mimeType: string | null;
  isDirectory: boolean;
}

export interface WebDAVConnectionTestResult {
  success: boolean;
  message: string;
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:getcontenttype/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`;

function createClient(credentials: WebDAVCredentials): AxiosInstance {
  return axios.create({
    baseURL: credentials.serverUrl.replace(/\/$/, ''),
    auth: {
      username: credentials.username,
      password: credentials.password,
    },
    timeout: 15000,
  });
}

function parseMultiStatus(xml: string): WebDAVFile[] {
  const files: WebDAVFile[] = [];
  const responseRegex = /<d:response>([\s\S]*?)<\/d:response>/gi;
  let match;

  while ((match = responseRegex.exec(xml)) !== null) {
    const block = match[1];

    const hrefMatch = block.match(/<d:href>([^<]+)<\/d:href>/);
    const href = hrefMatch ? decodeURIComponent(hrefMatch[1]) : '';

    const isDirectory = block.includes('<d:collection');

    const nameMatch = block.match(/<d:displayname>([^<]*)<\/d:displayname>/);
    const name = nameMatch ? nameMatch[1] : href.split('/').filter(Boolean).pop() ?? '';

    const sizeMatch = block.match(/<d:getcontentlength>(\d+)<\/d:getcontentlength>/);
    const size = sizeMatch ? parseInt(sizeMatch[1], 10) : null;

    const dateMatch = block.match(/<d:getlastmodified>([^<]+)<\/d:getlastmodified>/);
    const lastModified = dateMatch ? new Date(dateMatch[1]) : null;

    const mimeMatch = block.match(/<d:getcontenttype>([^<]+)<\/d:getcontenttype>/);
    const mimeType = mimeMatch ? mimeMatch[1] : null;

    files.push({ href, name, size, lastModified, mimeType, isDirectory });
  }

  return files;
}

export async function listFiles(
  credentials: WebDAVCredentials,
  path: string = '/',
): Promise<WebDAVFile[]> {
  const client = createClient(credentials);
  const response = await client.request({
    method: 'PROPFIND',
    url: path,
    headers: {
      Depth: '1',
      'Content-Type': 'application/xml',
    },
    data: PROPFIND_BODY,
  });

  const files = parseMultiStatus(response.data);
  return files.slice(1);
}

export async function downloadFile(
  credentials: WebDAVCredentials,
  path: string,
): Promise<Buffer> {
  const client = createClient(credentials);
  const response = await client.get(path, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}

export async function getFileInfo(
  credentials: WebDAVCredentials,
  path: string,
): Promise<WebDAVFile | null> {
  const client = createClient(credentials);
  const response = await client.request({
    method: 'PROPFIND',
    url: path,
    headers: {
      Depth: '0',
      'Content-Type': 'application/xml',
    },
    data: PROPFIND_BODY,
  });

  const files = parseMultiStatus(response.data);
  return files[0] ?? null;
}

export async function testConnection(
  credentials: WebDAVCredentials,
): Promise<WebDAVConnectionTestResult> {
  try {
    const client = createClient(credentials);
    await client.request({
      method: 'PROPFIND',
      url: '/',
      headers: { Depth: '0', 'Content-Type': 'application/xml' },
      data: `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop><d:displayname/></d:prop>
</d:propfind>`,
    });
    return { success: true, message: 'Verbindung erfolgreich' };
  } catch (error: any) {
    const status = error.response?.status;
    if (status === 401) return { success: false, message: 'Authentifizierung fehlgeschlagen' };
    if (status === 404) return { success: false, message: 'Server nicht gefunden' };
    return { success: false, message: error.message ?? 'Verbindung fehlgeschlagen' };
  }
}

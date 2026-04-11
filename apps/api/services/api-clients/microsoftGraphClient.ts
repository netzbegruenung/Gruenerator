import axios from 'axios';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

export interface MicrosoftDriveItem {
  id: string;
  name: string;
  size: number;
  lastModifiedDateTime: string;
  webUrl: string | null;
  file?: { mimeType: string };
  folder?: { childCount: number };
}

export interface MicrosoftDriveListResult {
  items: MicrosoftDriveItem[];
  nextLink: string | null;
}

export interface SharePointSite {
  id: string;
  displayName: string;
  webUrl: string;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const GRAPH_ID_PATTERN = /^[a-zA-Z0-9._!-]+$/;

function validateGraphId(id: string, label: string): string {
  if (!GRAPH_ID_PATTERN.test(id) || id.includes('..')) {
    throw new Error(`Invalid ${label} format`);
  }
  return id;
}

interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

export async function listDriveItems(
  token: string,
  folderId?: string
): Promise<MicrosoftDriveListResult> {
  if (folderId) validateGraphId(folderId, 'folder ID');
  const path = folderId ? `/me/drive/items/${folderId}/children` : '/me/drive/root/children';
  const response = await axios.get<GraphListResponse<MicrosoftDriveItem>>(`${GRAPH_API}${path}`, {
    headers: authHeaders(token),
    params: {
      $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder',
      $top: 50,
      $orderby: 'name',
    },
  });
  return {
    items: response.data.value,
    nextLink: response.data['@odata.nextLink'] ?? null,
  };
}

export async function getDriveItem(token: string, itemId: string): Promise<MicrosoftDriveItem> {
  validateGraphId(itemId, 'item ID');
  const response = await axios.get<MicrosoftDriveItem>(`${GRAPH_API}/me/drive/items/${itemId}`, {
    headers: authHeaders(token),
    params: {
      $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder',
    },
  });
  return response.data;
}

export async function downloadDriveItem(token: string, itemId: string): Promise<Buffer> {
  validateGraphId(itemId, 'item ID');
  const response = await axios.get<ArrayBuffer>(`${GRAPH_API}/me/drive/items/${itemId}/content`, {
    headers: authHeaders(token),
    responseType: 'arraybuffer',
  });
  return Buffer.from(response.data);
}

export async function listSharePointSites(token: string): Promise<SharePointSite[]> {
  const response = await axios.get<{ value: SharePointSite[] }>(`${GRAPH_API}/sites`, {
    headers: authHeaders(token),
    params: {
      search: '*',
      $select: 'id,displayName,webUrl',
      $top: 50,
    },
  });
  return response.data.value;
}

export async function listSharePointDriveItems(
  token: string,
  siteId: string,
  folderId?: string
): Promise<MicrosoftDriveListResult> {
  validateGraphId(siteId, 'site ID');
  if (folderId) validateGraphId(folderId, 'folder ID');
  const path = folderId
    ? `/sites/${siteId}/drive/items/${folderId}/children`
    : `/sites/${siteId}/drive/root/children`;
  const response = await axios.get<GraphListResponse<MicrosoftDriveItem>>(`${GRAPH_API}${path}`, {
    headers: authHeaders(token),
    params: {
      $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder',
      $top: 50,
    },
  });
  return {
    items: response.data.value,
    nextLink: response.data['@odata.nextLink'] ?? null,
  };
}

export async function listTeamsDriveItems(
  token: string,
  teamId: string,
  channelId?: string
): Promise<MicrosoftDriveListResult> {
  validateGraphId(teamId, 'team ID');
  if (channelId) validateGraphId(channelId, 'channel ID');
  const path = channelId
    ? `/teams/${teamId}/channels/${channelId}/filesFolder/children`
    : `/teams/${teamId}/drive/root/children`;
  const response = await axios.get<GraphListResponse<MicrosoftDriveItem>>(`${GRAPH_API}${path}`, {
    headers: authHeaders(token),
    params: {
      $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder',
      $top: 50,
    },
  });
  return {
    items: response.data.value,
    nextLink: response.data['@odata.nextLink'] ?? null,
  };
}

export async function searchDrive(token: string, query: string): Promise<MicrosoftDriveItem[]> {
  const sanitized = query.replace(/'/g, "''");
  const response = await axios.get<{ value: MicrosoftDriveItem[] }>(
    `${GRAPH_API}/me/drive/root/search(q='${sanitized}')`,
    {
      headers: authHeaders(token),
      params: {
        $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder',
        $top: 20,
      },
    }
  );
  return response.data.value;
}

import axios from 'axios';

import {
  graphDriveItemListResponseSchema,
  graphDriveSearchResponseSchema,
  microsoftDriveItemSchema,
  sharePointSiteListResponseSchema,
  type MicrosoftDriveItem,
  type SharePointSite,
} from './schemas/microsoft.js';

export type { MicrosoftDriveItem, SharePointSite } from './schemas/microsoft.js';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

export interface MicrosoftDriveListResult {
  items: MicrosoftDriveItem[];
  nextLink: string | null;
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

export async function listDriveItems(
  token: string,
  folderId?: string
): Promise<MicrosoftDriveListResult> {
  if (folderId) validateGraphId(folderId, 'folder ID');
  const path = folderId ? `/me/drive/items/${folderId}/children` : '/me/drive/root/children';
  const response = await axios.get(`${GRAPH_API}${path}`, {
    headers: authHeaders(token),
    params: {
      $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder',
      $top: 50,
      $orderby: 'name',
    },
  });
  const parsed = graphDriveItemListResponseSchema.parse(response.data);
  return {
    items: parsed.value,
    nextLink: parsed['@odata.nextLink'] ?? null,
  };
}

export async function getDriveItem(token: string, itemId: string): Promise<MicrosoftDriveItem> {
  validateGraphId(itemId, 'item ID');
  const response = await axios.get(`${GRAPH_API}/me/drive/items/${itemId}`, {
    headers: authHeaders(token),
    params: {
      $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder',
    },
  });
  return microsoftDriveItemSchema.parse(response.data);
}

export async function downloadDriveItem(token: string, itemId: string): Promise<Buffer> {
  validateGraphId(itemId, 'item ID');
  const response = await axios.get(`${GRAPH_API}/me/drive/items/${itemId}/content`, {
    headers: authHeaders(token),
    responseType: 'arraybuffer',
  });
  return Buffer.from(response.data);
}

export async function listSharePointSites(token: string): Promise<SharePointSite[]> {
  const response = await axios.get(`${GRAPH_API}/sites`, {
    headers: authHeaders(token),
    params: {
      search: '*',
      $select: 'id,displayName,webUrl',
      $top: 50,
    },
  });
  return sharePointSiteListResponseSchema.parse(response.data).value;
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
  const response = await axios.get(`${GRAPH_API}${path}`, {
    headers: authHeaders(token),
    params: {
      $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder',
      $top: 50,
    },
  });
  const parsed = graphDriveItemListResponseSchema.parse(response.data);
  return {
    items: parsed.value,
    nextLink: parsed['@odata.nextLink'] ?? null,
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
  const response = await axios.get(`${GRAPH_API}${path}`, {
    headers: authHeaders(token),
    params: {
      $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder',
      $top: 50,
    },
  });
  const parsed = graphDriveItemListResponseSchema.parse(response.data);
  return {
    items: parsed.value,
    nextLink: parsed['@odata.nextLink'] ?? null,
  };
}

export async function searchDrive(token: string, query: string): Promise<MicrosoftDriveItem[]> {
  const sanitized = query.replace(/'/g, "''");
  const response = await axios.get(`${GRAPH_API}/me/drive/root/search(q='${sanitized}')`, {
    headers: authHeaders(token),
    params: {
      $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder',
      $top: 20,
    },
  });
  return graphDriveSearchResponseSchema.parse(response.data).value;
}

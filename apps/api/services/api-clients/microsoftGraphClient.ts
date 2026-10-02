import axios from 'axios';

import {
  graphDriveItemListResponseSchema,
  microsoftDriveItemSchema,
  type MicrosoftDriveItem,
} from './schemas/microsoft.js';

export type { MicrosoftDriveItem } from './schemas/microsoft.js';

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

/** Per-folder cap; past it `nextLink` stays set. */
const MAX_LIST_ITEMS = 1000;

/**
 * Follows `@odata.nextLink` up to the cap. The link comes from the response and
 * gets the bearer token attached, so it must point back at Graph.
 */
export async function listDriveItems(
  token: string,
  folderId?: string
): Promise<MicrosoftDriveListResult> {
  if (folderId) validateGraphId(folderId, 'folder ID');
  const path = folderId ? `/me/drive/items/${folderId}/children` : '/me/drive/root/children';
  const items: MicrosoftDriveItem[] = [];
  let url: string | null = `${GRAPH_API}${path}`;
  let params: Record<string, string | number> | undefined = {
    $select: 'id,name,size,lastModifiedDateTime,webUrl,file,folder',
    $top: 200,
    $orderby: 'name',
  };
  while (url && items.length < MAX_LIST_ITEMS) {
    if (!url.startsWith(`${GRAPH_API}/`)) throw new Error('Unexpected Graph nextLink host');
    const response = await axios.get(url, { headers: authHeaders(token), params });
    const parsed = graphDriveItemListResponseSchema.parse(response.data);
    items.push(...parsed.value);
    url = parsed['@odata.nextLink'] ?? null;
    params = undefined;
  }
  return { items, nextLink: url };
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

/** `asPdf` lets Graph convert Office formats our extraction can't read. */
export async function downloadDriveItem(
  token: string,
  itemId: string,
  options: { asPdf?: boolean } = {}
): Promise<Buffer> {
  validateGraphId(itemId, 'item ID');
  const response = await axios.get(`${GRAPH_API}/me/drive/items/${itemId}/content`, {
    headers: authHeaders(token),
    params: options.asPdf ? { format: 'pdf' } : undefined,
    responseType: 'arraybuffer',
  });
  return Buffer.from(response.data);
}

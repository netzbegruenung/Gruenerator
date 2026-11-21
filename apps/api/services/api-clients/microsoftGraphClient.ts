import axios from 'axios';

import {
  graphChannelListResponseSchema,
  graphDriveItemListResponseSchema,
  graphFilesFolderSchema,
  graphTeamListResponseSchema,
  microsoftDriveItemSchema,
  type MicrosoftChannel,
  type MicrosoftDriveItem,
  type MicrosoftTeam,
} from './schemas/microsoft.js';

export type { MicrosoftChannel, MicrosoftDriveItem, MicrosoftTeam } from './schemas/microsoft.js';

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
 * `@odata.nextLink` comes from the response and gets the bearer token attached:
 * only its path+query is kept, re-rooted on the constant Graph base.
 */
function graphNextUrl(nextLink: string): string {
  const prefix = `${GRAPH_API}/`;
  if (!nextLink.startsWith(prefix)) throw new Error('Unexpected Graph nextLink host');
  return `${GRAPH_API}/${nextLink.slice(prefix.length)}`;
}

/**
 * `/me/drive` without `driveId`; a team's document library (from a channel's
 * `filesFolder`) with it.
 */
function driveBase(driveId?: string): string {
  return driveId ? `/drives/${validateGraphId(driveId, 'drive ID')}` : '/me/drive';
}

const ITEM_SELECT = 'id,name,size,lastModifiedDateTime,webUrl,file,folder';

/** Follows `@odata.nextLink` up to the cap. */
async function collectItems(
  token: string,
  firstUrl: string,
  firstParams: Record<string, string | number>
): Promise<MicrosoftDriveListResult> {
  const items: MicrosoftDriveItem[] = [];
  let url: string | null = firstUrl;
  let nextLink: string | null = null;
  let params: Record<string, string | number> | undefined = firstParams;
  while (url && items.length < MAX_LIST_ITEMS) {
    const response = await axios.get(url, { headers: authHeaders(token), params });
    const parsed = graphDriveItemListResponseSchema.parse(response.data);
    items.push(...parsed.value);
    nextLink = parsed['@odata.nextLink'] ?? null;
    url = nextLink ? graphNextUrl(nextLink) : null;
    params = undefined;
  }
  return { items, nextLink };
}

export async function listDriveItems(
  token: string,
  folderId?: string,
  driveId?: string
): Promise<MicrosoftDriveListResult> {
  if (folderId) validateGraphId(folderId, 'folder ID');
  const base = driveBase(driveId);
  const path = folderId ? `${base}/items/${folderId}/children` : `${base}/root/children`;
  return collectItems(token, `${GRAPH_API}${path}`, {
    $select: ITEM_SELECT,
    $top: 200,
    $orderby: 'name',
  });
}

/**
 * Path addressing `/me/drive/root:/<path>:` — each segment percent-encoded.
 * https://learn.microsoft.com/graph/api/driveitem-get (access by path)
 * Callers pass a path already checked by `assertRootRelativePath`.
 */
function pathAddress(path: string): string {
  const encoded = path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return encoded ? `/me/drive/root:/${encoded}:` : '/me/drive/root';
}

/** Children of a folder addressed by its path; `''` is the drive root. */
export async function listDriveItemsAtPath(
  token: string,
  path: string
): Promise<MicrosoftDriveListResult> {
  const address = pathAddress(path);
  return collectItems(token, `${GRAPH_API}${address}/children`, {
    $select: ITEM_SELECT,
    $top: 200,
  });
}

/** One item by path (`''` = drive root). */
export async function getDriveItemByPath(token: string, path: string): Promise<MicrosoftDriveItem> {
  const response = await axios.get(`${GRAPH_API}${pathAddress(path)}`, {
    headers: authHeaders(token),
    params: { $select: ITEM_SELECT },
  });
  return microsoftDriveItemSchema.parse(response.data);
}

/**
 * Drive search, first page only (`nextLink` set when there is more). Graph
 * matches file name AND content, so callers still filter by name themselves.
 * https://learn.microsoft.com/graph/api/driveitem-search — single quotes in the
 * term are doubled.
 */
export async function searchDriveItems(
  token: string,
  query: string
): Promise<MicrosoftDriveListResult> {
  const term = encodeURIComponent(query.replace(/'/g, "''"));
  const response = await axios.get(`${GRAPH_API}/me/drive/root/search(q='${term}')`, {
    headers: authHeaders(token),
    params: { $select: `${ITEM_SELECT},parentReference`, $top: 50 },
  });
  const parsed = graphDriveItemListResponseSchema.parse(response.data);
  return { items: parsed.value, nextLink: parsed['@odata.nextLink'] ?? null };
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

/** Ordner im eigenen OneDrive, in dem Exporte landen (Graph legt ihn an). */
export const EXPORT_FOLDER = 'Grünerator';

/**
 * Lädt eine Datei nach `/Grünerator/<name>` im eigenen OneDrive. Bei gleichem
 * Namen vergibt Graph einen neuen (`conflictBehavior=rename`), nichts wird
 * überschrieben. Bis 250 MB reicht der einfache Upload.
 */
export async function uploadToMyDrive(
  token: string,
  content: Buffer,
  filename: string
): Promise<MicrosoftDriveItem> {
  const path = `${encodeURIComponent(EXPORT_FOLDER)}/${encodeURIComponent(filename)}`;
  const response = await axios.put(`${GRAPH_API}/me/drive/root:/${path}:/content`, content, {
    headers: { ...authHeaders(token), 'Content-Type': 'application/octet-stream' },
    params: { '@microsoft.graph.conflictBehavior': 'rename' },
    maxBodyLength: Infinity,
  });
  return microsoftDriveItemSchema.parse(response.data);
}

/** `asPdf` lets Graph convert Office formats our extraction can't read. */
export async function downloadDriveItem(
  token: string,
  itemId: string,
  options: { asPdf?: boolean; driveId?: string } = {}
): Promise<Buffer> {
  validateGraphId(itemId, 'item ID');
  const base = driveBase(options.driveId);
  const response = await axios.get(`${GRAPH_API}${base}/items/${itemId}/content`, {
    headers: authHeaders(token),
    params: options.asPdf ? { format: 'pdf' } : undefined,
    responseType: 'arraybuffer',
  });
  return Buffer.from(response.data);
}

// ── Teams ──────────────────────────────────────────────────────────────────
// Team- und Kanal-Kennungen gehen nur als Pfadsegment an Graph und werden
// dafür kodiert: Kanal-IDs enthalten `:` und `@` (`19:…@thread.tacv2`).

/** Teams, in denen die Person direkt Mitglied ist (`Team.ReadBasic.All`). */
export async function listJoinedTeams(token: string): Promise<MicrosoftTeam[]> {
  const response = await axios.get(`${GRAPH_API}/me/joinedTeams`, {
    headers: authHeaders(token),
  });
  return graphTeamListResponseSchema.parse(response.data).value.filter((team) => !team.isArchived);
}

/**
 * Kanäle eines Teams (`Channel.ReadBasic.All`). Private und geteilte Kanäle
 * sieht nur, wer Mitglied ist — das filtert Graph selbst.
 */
export async function listChannels(token: string, teamId: string): Promise<MicrosoftChannel[]> {
  const response = await axios.get(`${GRAPH_API}/teams/${encodeURIComponent(teamId)}/channels`, {
    headers: authHeaders(token),
    // `email` is expensive to populate (Graph docs) and unused here.
    params: { $select: 'id,displayName,membershipType,isArchived' },
  });
  return graphChannelListResponseSchema
    .parse(response.data)
    .value.filter((channel) => !channel.isArchived);
}

/**
 * Der Dateiordner eines Kanals in der Dokumentbibliothek des Teams
 * (`Files.Read.All`). `parentReference.driveId` ist die Bibliothek, in der
 * alles Weitere über `/drives/{driveId}` läuft.
 */
export async function getChannelFilesFolder(
  token: string,
  teamId: string,
  channelId: string
): Promise<{ driveId: string; itemId: string; webUrl: string | null }> {
  const response = await axios.get(
    `${GRAPH_API}/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}/filesFolder`,
    { headers: authHeaders(token) }
  );
  const folder = graphFilesFolderSchema.parse(response.data);
  return {
    driveId: folder.parentReference.driveId,
    itemId: folder.id,
    webUrl: folder.webUrl ?? null,
  };
}

/**
 * Legt eine Datei in einem Ordner einer fremden Bibliothek an
 * (`Files.ReadWrite.All`), ohne zu überschreiben.
 */
export async function uploadToFolder(
  token: string,
  driveId: string,
  parentId: string,
  filename: string,
  content: Buffer
): Promise<MicrosoftDriveItem> {
  validateGraphId(parentId, 'folder ID');
  const response = await axios.put(
    `${GRAPH_API}${driveBase(driveId)}/items/${parentId}:/${encodeURIComponent(filename)}:/content`,
    content,
    {
      headers: { ...authHeaders(token), 'Content-Type': 'application/octet-stream' },
      params: { '@microsoft.graph.conflictBehavior': 'rename' },
      maxBodyLength: Infinity,
    }
  );
  return microsoftDriveItemSchema.parse(response.data);
}

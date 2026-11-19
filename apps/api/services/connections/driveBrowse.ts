/**
 * Ein Ordner eines verbundenen Laufwerks, in einer Form für beide Anbieter.
 *
 * Die Rohformen (Drive `{files}`, Graph `{items}`) bleiben in den API-Clients;
 * hier entsteht, was der Dateibrowser im Chat und die Admin-Testseite zeigen.
 */
import { type DriveEntry, type DriveProvider } from '@gruenerator/contracts';

import * as googleDriveClient from '../api-clients/googleDriveClient.js';
import * as microsoftGraphClient from '../api-clients/microsoftGraphClient.js';

import { isConnectFileSupported } from './connectFileSupport.js';
import { decodeTeamsRef, encodeTeamsRef } from './teamsIds.js';

const GOOGLE_FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface DriveFolder {
  entries: DriveEntry[];
  truncated: boolean;
}

export async function browseDrive(
  provider: DriveProvider,
  accessToken: string,
  folderId?: string
): Promise<DriveFolder> {
  if (provider === 'google') {
    const result = await googleDriveClient.listFiles(accessToken, folderId);
    return {
      truncated: result.nextPageToken !== null,
      entries: result.files.map((f) => {
        const isFolder = f.mimeType === GOOGLE_FOLDER_MIME;
        const size = f.size ? Number(f.size) : null;
        return {
          id: f.id,
          name: f.name,
          isFolder,
          mimeType: f.mimeType,
          size: Number.isFinite(size) ? size : null,
          isSupported: !isFolder && isConnectFileSupported('google', f.name, f.mimeType),
        };
      }),
    };
  }
  if (provider === 'microsoft-teams') return browseTeams(accessToken, folderId);
  const result = await microsoftGraphClient.listDriveItems(accessToken, folderId);
  return graphFolder(result, 'microsoft', (item) => item.id);
}

function graphFolder(
  result: microsoftGraphClient.MicrosoftDriveListResult,
  provider: 'microsoft' | 'microsoft-teams',
  idOf: (item: microsoftGraphClient.MicrosoftDriveItem) => string
): DriveFolder {
  return {
    truncated: result.nextLink !== null,
    entries: result.items.map((item) => {
      const isFolder = Boolean(item.folder);
      const mimeType = item.file?.mimeType ?? null;
      return {
        id: idOf(item),
        name: item.name,
        isFolder,
        mimeType,
        size: isFolder ? null : item.size,
        isSupported: !isFolder && isConnectFileSupported(provider, item.name, mimeType),
      };
    }),
  };
}

const teamsFolder = (id: string, name: string): DriveEntry => ({
  id,
  name,
  isFolder: true,
  mimeType: null,
  size: null,
  isSupported: false,
});

/**
 * Teams → Kanäle → Dateiordner des Kanals → Unterordner. Ab dem Dateiordner
 * ist es eine gewöhnliche Graph-Bibliothek; jede Kennung trägt die Bibliothek
 * mit (`teamsIds.ts`).
 */
async function browseTeams(accessToken: string, folderId?: string): Promise<DriveFolder> {
  if (!folderId) {
    const teams = await microsoftGraphClient.listJoinedTeams(accessToken);
    return {
      truncated: false,
      entries: teams.map((t) =>
        teamsFolder(encodeTeamsRef({ kind: 'team', teamId: t.id }), t.displayName)
      ),
    };
  }
  const ref = decodeTeamsRef(folderId);
  if (!ref) throw new Error('Invalid folder ID format');
  if (ref.kind === 'team') {
    const channels = await microsoftGraphClient.listChannels(accessToken, ref.teamId);
    return {
      truncated: false,
      entries: channels.map((c) =>
        teamsFolder(
          encodeTeamsRef({ kind: 'channel', teamId: ref.teamId, channelId: c.id }),
          c.displayName
        )
      ),
    };
  }
  const folder =
    ref.kind === 'channel'
      ? await microsoftGraphClient.getChannelFilesFolder(accessToken, ref.teamId, ref.channelId)
      : ref;
  const result = await microsoftGraphClient.listDriveItems(
    accessToken,
    folder.itemId,
    folder.driveId
  );
  return graphFolder(result, 'microsoft-teams', (item) =>
    encodeTeamsRef({ kind: 'item', driveId: folder.driveId, itemId: item.id })
  );
}

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
  const result = await microsoftGraphClient.listDriveItems(accessToken, folderId);
  return {
    truncated: result.nextLink !== null,
    entries: result.items.map((item) => {
      const isFolder = Boolean(item.folder);
      const mimeType = item.file?.mimeType ?? null;
      return {
        id: item.id,
        name: item.name,
        isFolder,
        mimeType,
        size: isFolder ? null : item.size,
        isSupported: !isFolder && isConnectFileSupported('microsoft', item.name, mimeType),
      };
    }),
  };
}

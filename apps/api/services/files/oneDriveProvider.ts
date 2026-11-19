/**
 * `CloudFileProvider` über OneDrive (Microsoft Graph), lesend.
 *
 * OneDrive ist pfadadressiert (`/me/drive/root:/<pfad>:`) und passt damit ohne
 * Verbiegen auf das Pfad-Interface. Das Zugriffstoken stammt aus dem
 * verbundenen Microsoft-365-Konto (Nango); `CloudRoot.secret` trägt dafür nur
 * die Nutzer-Id und nie ein Token — das wird je Aufruf frisch geholt.
 *
 * Quellen: https://learn.microsoft.com/graph/api/driveitem-list-children,
 * https://learn.microsoft.com/graph/api/driveitem-get,
 * https://learn.microsoft.com/graph/api/driveitem-search,
 * https://learn.microsoft.com/graph/api/driveitem-get-content (`?format=pdf`).
 */
import { createLogger } from '../../utils/logger.js';
import { assertRootRelativePath, CloudPathError } from '../../utils/validation/cloudPaths.js';
import * as graph from '../api-clients/microsoftGraphClient.js';
import {
  GRAPH_PDF_CONVERTIBLE,
  isConnectFileSupported,
} from '../connections/connectFileSupport.js';

import { CloudAccessError, guardDriveCall } from './driveErrors.js';
import { findNangoConnectionId, getNangoAccessToken } from './nangoDriveAccess.js';
import {
  type CloudConnectionTest,
  type CloudDownload,
  type CloudEntry,
  type CloudFileProvider,
  type CloudFindQuery,
  type CloudListing,
  type CloudListOptions,
  type CloudRoot,
} from './types.js';

import type { MicrosoftDriveItem } from '../api-clients/microsoftGraphClient.js';

const log = createLogger('OneDriveProvider');

/** Dieselben Deckel wie bei der Nextcloud-Wolke: jede Ebene ist ein Netzaufruf. */
const BROWSE_MAX_DEPTH = 3;
const BROWSE_MAX_FILES = 1000;

/** Größer wird nichts in den Speicher gezogen — ein Turn ist kein Dateitransfer. */
export const ONEDRIVE_MAX_READ_BYTES = 25 * 1024 * 1024;

export interface OneDriveDeps {
  connectionIdOf(userId: string): Promise<string | null>;
  token(userId: string): Promise<string>;
  listAtPath: typeof graph.listDriveItemsAtPath;
  getByPath: typeof graph.getDriveItemByPath;
  search: typeof graph.searchDriveItems;
  download: typeof graph.downloadDriveItem;
}

const join = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

function toEntry(item: MicrosoftDriveItem, path: string): CloudEntry {
  const isDirectory = Boolean(item.folder);
  const mimeType = item.file?.mimeType ?? null;
  return {
    path,
    name: item.name,
    isDirectory,
    size: isDirectory ? null : item.size,
    mimeType,
    lastModified: new Date(item.lastModifiedDateTime),
    etag: null,
    isSupported: !isDirectory && isConnectFileSupported('microsoft', item.name, mimeType),
  };
}

function sortEntries(entries: CloudEntry[]): CloudEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, 'de');
  });
}

/**
 * `parentReference.path` (`/drive/root:/Ordner/Unter`, URL-kodiert) → Ordnerpfad
 * relativ zur Wurzel. `null`, wenn das Element nicht im eigenen Drive liegt.
 */
function parentFolderOf(item: MicrosoftDriveItem): string | null {
  const raw = item.parentReference?.path;
  if (!raw) return null;
  const marker = raw.indexOf('root:');
  if (marker < 0) return null;
  const rest = raw.slice(marker + 'root:'.length);
  return rest
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join('/');
}

export class OneDriveProvider implements CloudFileProvider {
  readonly id = 'onedrive' as const;

  constructor(private readonly deps: OneDriveDeps) {}

  async listRoots(userId: string): Promise<CloudRoot[]> {
    const connectionId = await this.deps.connectionIdOf(userId);
    if (!connectionId) return [];
    return [
      {
        connectionId,
        providerId: this.id,
        label: 'OneDrive',
        host: 'onedrive.live.com',
        origin: 'own',
        isActive: true,
        secret: userId,
      },
    ];
  }

  async list(root: CloudRoot, path: string, options: CloudListOptions = {}): Promise<CloudListing> {
    const folder = assertRootRelativePath(path);
    const token = await this.deps.token(root.secret);
    const listFolder = (target: string) =>
      guardDriveCall(() => this.deps.listAtPath(token, target));

    if (!options.recursive) {
      const result = await listFolder(folder);
      const entries = result.items.map((item) => toEntry(item, join(folder, item.name)));
      return {
        entries: sortEntries(entries),
        folderCount: entries.filter((e) => e.isDirectory).length,
        depthLimited: false,
        truncated: result.nextLink !== null,
      };
    }

    const maxDepth = options.maxDepth ?? BROWSE_MAX_DEPTH;
    const maxFiles = options.maxFiles ?? BROWSE_MAX_FILES;
    const files: CloudEntry[] = [];
    let folderCount = 0;
    let depthLimited = false;
    let truncated = false;
    let frontier = [folder];

    walk: for (let depth = 0; depth <= maxDepth && frontier.length > 0; depth++) {
      const next: string[] = [];
      for (const current of frontier) {
        const result = await listFolder(current);
        if (result.nextLink !== null) truncated = true;
        for (const item of result.items) {
          const entry = toEntry(item, join(current, item.name));
          if (entry.isDirectory) {
            folderCount++;
            if (depth < maxDepth) next.push(entry.path);
            else depthLimited = true;
            continue;
          }
          if (files.length >= maxFiles) {
            truncated = true;
            break walk;
          }
          files.push(entry);
        }
      }
      frontier = next;
    }
    return { entries: sortEntries(files), folderCount, depthLimited, truncated };
  }

  async find(root: CloudRoot, query: CloudFindQuery): Promise<CloudListing> {
    const needle = query.name?.trim().toLowerCase();
    const extensions = query.extensions?.map((e) =>
      e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
    );
    const matches = (entry: CloudEntry) => {
      if (entry.isDirectory) return false;
      const lower = entry.name.toLowerCase();
      if (needle && !lower.includes(needle)) return false;
      if (extensions?.length && !extensions.some((ext) => lower.endsWith(ext))) return false;
      return true;
    };

    if (!needle) {
      // Nur Endungen: die Graph-Suche kennt keinen Endungsfilter, also gehen
      // wir durch die Ordner, mit denselben Deckeln wie `list`.
      const listing = await this.list(root, '', {
        recursive: true,
        maxDepth: query.maxDepth ?? BROWSE_MAX_DEPTH,
        maxFiles: query.maxFiles ?? BROWSE_MAX_FILES,
      });
      return { ...listing, entries: listing.entries.filter(matches) };
    }

    const token = await this.deps.token(root.secret);
    const result = await guardDriveCall(() => this.deps.search(token, query.name!.trim()));
    const entries: CloudEntry[] = [];
    for (const item of result.items) {
      const folder = parentFolderOf(item);
      if (folder === null) continue;
      const entry = toEntry(item, join(folder, item.name));
      if (matches(entry)) entries.push(entry);
    }
    return {
      entries: sortEntries(entries),
      folderCount: 0,
      depthLimited: false,
      truncated: result.nextLink !== null,
    };
  }

  async read(root: CloudRoot, path: string): Promise<CloudDownload> {
    const file = assertRootRelativePath(path);
    if (!file) throw new CloudPathError('read braucht einen Dateipfad.');
    const token = await this.deps.token(root.secret);
    const item = await guardDriveCall(() => this.deps.getByPath(token, file));
    if (item.folder) {
      throw new CloudAccessError(
        'unsupported',
        'Das ist ein Ordner, keine Datei — mit action="list" lässt er sich öffnen.'
      );
    }
    if (item.size > ONEDRIVE_MAX_READ_BYTES) {
      throw new CloudAccessError(
        'too_large',
        `Die Datei ist mit ${Math.round(item.size / (1024 * 1024))} MB zu groß zum Lesen (Grenze 25 MB).`
      );
    }
    // Office-Formate, die unsere Extraktion nicht liest, wandelt Graph in PDF.
    const asPdf = GRAPH_PDF_CONVERTIBLE.test(item.name);
    const buffer = await guardDriveCall(() => this.deps.download(token, item.id, { asPdf }));
    return asPdf
      ? {
          buffer,
          mimeType: 'application/pdf',
          size: buffer.length,
          name: `${item.name}.pdf`,
        }
      : {
          buffer,
          mimeType: item.file?.mimeType ?? null,
          size: buffer.length,
          name: item.name,
        };
  }

  async test(target: CloudRoot | { link: string }): Promise<CloudConnectionTest> {
    if (!('secret' in target)) return { ok: false, errorCode: 'invalid_link' };
    try {
      const token = await this.deps.token(target.secret);
      const result = await guardDriveCall(() => this.deps.listAtPath(token, ''));
      return { ok: true, entryCount: result.items.length };
    } catch (err) {
      log.warn('OneDrive test failed', err);
      if (err instanceof CloudAccessError && err.kind === 'reauth') {
        return { ok: false, errorCode: 'forbidden' };
      }
      return { ok: false, errorCode: 'unknown' };
    }
  }
}

export const oneDriveProvider = new OneDriveProvider({
  connectionIdOf: (userId) => findNangoConnectionId(userId, 'microsoft'),
  token: (userId) => getNangoAccessToken(userId, 'microsoft'),
  listAtPath: graph.listDriveItemsAtPath,
  getByPath: graph.getDriveItemByPath,
  search: graph.searchDriveItems,
  download: graph.downloadDriveItem,
});

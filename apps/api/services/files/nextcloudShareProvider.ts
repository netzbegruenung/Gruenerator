/**
 * `CloudFileProvider` über öffentliche Nextcloud-Freigabe-Links.
 *
 * Kein neuer WebDAV-Code: die Verbindung macht `NextcloudApiClient`, die
 * Traversierung `walkWolkeFolder`, die Verbindungsliste `NextcloudShareManager`.
 * Was hier entsteht, ist die anbieterneutrale Form darüber — Wurzeln,
 * relative Pfade, ein Deckel-Vokabular.
 *
 * Die Abhängigkeiten kommen über den Konstruktor herein, damit der Test ohne
 * Netz und ohne Datenbank läuft. Die verdrahtete Fassung steht am Dateiende.
 */

import { NextcloudShareManager } from '../../utils/integrations/nextcloud/shareManager.js';
import { createLogger } from '../../utils/logger.js';
import { CloudPathError, assertRootRelativePath } from '../../utils/validation/cloudPaths.js';
import NextcloudApiClient from '../api-clients/nextcloudApiClient.js';
import { folderPathFromHref, walkWolkeFolder } from '../sync/folderWalk.js';
import { isSupportedWolkeFile } from '../sync/supportedFileTypes.js';

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

import type { NextcloudShareLink } from '../../utils/integrations/nextcloud/types.js';
import type { NextcloudFile } from '../api-clients/nextcloudApiClient.js';

const log = createLogger('NextcloudShareProvider');

/**
 * Wie tief ein Blättern im Chat gehen darf. Bewusst dieselbe Zahl wie beim
 * Notebook-Import: jede Ebene ist ein PROPFIND über das Netz, und eine Antwort,
 * die zwanzig Sekunden auf eine Ordnerliste wartet, ist keine Antwort.
 */
export const CLOUD_BROWSE_MAX_DEPTH = 3;

/**
 * Mengendeckel für einen rekursiven Lauf. Höher als beim Import (500), weil
 * hier nichts heruntergeladen wird — aber endlich, damit ein Backup-Ordner
 * keinen Turn auffrisst.
 */
export const CLOUD_BROWSE_MAX_FILES = 1000;

/** Der Präfix, unter dem ein öffentlicher Share seine Dateien führt. */
const WEBDAV_PREFIX = '/public.php/webdav';

/** WebDAV-href → Pfad relativ zur Freigabe-Wurzel (dekodiert, ohne Schrägstriche). */
export function hrefToRootRelativePath(href: string): string {
  const idx = href.indexOf(WEBDAV_PREFIX);
  const raw = idx >= 0 ? href.slice(idx + WEBDAV_PREFIX.length) : href;
  return raw
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

/**
 * Ein Pfad, der den WebDAV-Präfix noch mitträgt, meint dieselbe Datei:
 * `hrefToRootRelativePath` liefert ihn ohne, ein href aus einer PROPFIND-Antwort
 * mit. Erst abschneiden, dann prüfen — sonst hinge die Prüfung an der Form und
 * nicht am Inhalt, und `../` hinter dem Präfix käme ungesehen durch.
 */
function stripWebdavPrefix(path: string): string {
  const idx = path.indexOf(WEBDAV_PREFIX);
  return idx >= 0 ? path.slice(idx + WEBDAV_PREFIX.length) : path;
}

/** Der eine Weg, auf dem ein Pfad in diesen Anbieter hineingelangt. */
function safePath(path: string | null | undefined): string {
  return assertRootRelativePath(stripWebdavPrefix((path ?? '').trim()));
}

function toEntry(file: NextcloudFile): CloudEntry {
  const isDirectory = file.isDirectory === true;
  return {
    path: hrefToRootRelativePath(file.href),
    name: file.name,
    isDirectory,
    size: file.size,
    // Der WebDAV-PROPFIND, den wir stellen, fragt `getcontenttype` nicht ab —
    // den Medientyp liefert erst der GET. Ehrlich `null` statt geraten.
    mimeType: null,
    lastModified: file.lastModified,
    etag: file.etag,
    isSupported: !isDirectory && isSupportedWolkeFile(file.name),
  };
}

/** Ordner zuerst, danach alphabetisch — dieselbe Ordnung wie im Datei-Browser. */
function sortEntries(entries: CloudEntry[]): CloudEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, 'de');
  });
}

/** Nur die Teile, die der Provider von einem Share-Link wirklich braucht. */
type ShareLinkRow = Pick<NextcloudShareLink, 'id' | 'share_link' | 'label' | 'is_active'>;

export interface NextcloudProviderDeps {
  listOwnLinks(userId: string): Promise<ShareLinkRow[]>;
  listSharedLinks(
    userId: string
  ): Promise<Array<{ link: ShareLinkRow; groupName: string; sharedByName: string | null }>>;
  createClient(shareLink: string): Promise<NextcloudApiClient>;
}

export class NextcloudShareProvider implements CloudFileProvider {
  readonly id = 'nextcloud-share' as const;

  constructor(private readonly deps: NextcloudProviderDeps) {}

  async listRoots(userId: string): Promise<CloudRoot[]> {
    const [own, shared] = await Promise.all([
      this.deps.listOwnLinks(userId).catch((err: unknown) => {
        log.warn('own share links unavailable', err);
        return [] as ShareLinkRow[];
      }),
      this.deps.listSharedLinks(userId).catch((err: unknown) => {
        log.warn('group-shared share links unavailable', err);
        return [];
      }),
    ]);

    const roots: CloudRoot[] = own.map((link) => this.#toRoot(link, 'own'));
    for (const entry of shared) {
      // Ein Link, den man selbst besitzt UND der in einer eigenen Gruppe liegt,
      // ist eine Wurzel, nicht zwei.
      if (roots.some((r) => r.connectionId === entry.link.id)) continue;
      roots.push({
        ...this.#toRoot(entry.link, 'group'),
        sharedVia: { groupName: entry.groupName, sharedByName: entry.sharedByName },
      });
    }
    return roots;
  }

  #toRoot(link: ShareLinkRow, origin: 'own' | 'group'): CloudRoot {
    let host = '';
    try {
      host = new URL(link.share_link).host;
    } catch {
      // Ein unparsbarer Link ist kein Grund, die ganze Liste fallen zu lassen —
      // `test` sagt der Person dann, was damit ist.
    }
    return {
      connectionId: link.id,
      providerId: this.id,
      label: link.label?.trim() || '',
      host,
      origin,
      isActive: link.is_active !== false,
      secret: link.share_link,
    };
  }

  async list(root: CloudRoot, path: string, options: CloudListOptions = {}): Promise<CloudListing> {
    const folder = safePath(path);
    const client = await this.deps.createClient(root.secret);
    const listFolder = (target: string) => client.listFolder(target || undefined);

    if (!options.recursive) {
      const entries = (await listFolder(folder)).map(toEntry);
      return {
        entries: sortEntries(entries),
        folderCount: entries.filter((e) => e.isDirectory).length,
        depthLimited: false,
        truncated: false,
      };
    }

    const walk = await walkWolkeFolder(listFolder, folder, {
      maxDepth: options.maxDepth ?? CLOUD_BROWSE_MAX_DEPTH,
      maxFiles: options.maxFiles ?? CLOUD_BROWSE_MAX_FILES,
    });
    return {
      entries: sortEntries(walk.files.map(toEntry)),
      folderCount: walk.folderCount,
      depthLimited: walk.depthLimited,
      truncated: walk.truncated,
    };
  }

  async find(root: CloudRoot, query: CloudFindQuery): Promise<CloudListing> {
    const listing = await this.list(root, '', {
      recursive: true,
      maxDepth: query.maxDepth ?? CLOUD_BROWSE_MAX_DEPTH,
      maxFiles: query.maxFiles ?? CLOUD_BROWSE_MAX_FILES,
    });
    const needle = query.name?.trim().toLowerCase();
    const extensions = query.extensions?.map((e) =>
      e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
    );
    const entries = listing.entries.filter((entry) => {
      if (entry.isDirectory) return false;
      const lower = entry.name.toLowerCase();
      if (needle && !lower.includes(needle)) return false;
      if (extensions?.length && !extensions.some((ext) => lower.endsWith(ext))) return false;
      return true;
    });
    return { ...listing, entries };
  }

  async read(root: CloudRoot, path: string): Promise<CloudDownload> {
    const file = safePath(path);
    if (!file) throw new CloudPathError('read braucht einen Dateipfad.');
    const client = await this.deps.createClient(root.secret);
    return client.downloadFile(file);
  }

  async test(target: CloudRoot | { link: string }): Promise<CloudConnectionTest> {
    const link = 'secret' in target ? target.secret : target.link;
    let client: NextcloudApiClient;
    try {
      client = await this.deps.createClient(link);
    } catch (err) {
      log.warn('client init failed', err);
      return { ok: false, errorCode: 'invalid_link' };
    }

    const result = await client.testConnection();
    if (!result.success) {
      return { ok: false, errorCode: result.errorCode ?? 'unknown' };
    }

    // `testConnection` beweist nur, dass der Link antwortet. Ob etwas darin
    // liegt, sagt erst eine Auflistung — und genau das ist die Zahl, die eine
    // Rückfrage vor dem Anlegen brauchbar macht.
    try {
      const entries = await client.listFolder(undefined);
      return { ok: true, entryCount: entries.length };
    } catch (err) {
      // Bewusst geschluckt: eine File-Drop-Freigabe scheitert schon am
      // PROPFIND in `testConnection` (405 → `file_drop`), hier landet nur
      // noch ein transienter Listing-Fehler hinter einem erreichbaren Link.
      log.warn('root listing after successful test failed', err);
      return { ok: true };
    }
  }
}

/** Die verdrahtete Fassung — Datenbank und Netz. */
export const nextcloudShareProvider = new NextcloudShareProvider({
  listOwnLinks: (userId) => NextcloudShareManager.getShareLinks(userId),
  listSharedLinks: async (userId) => {
    const shared = await NextcloudShareManager.listLinksSharedWithUser(userId);
    return shared.map((entry) => ({
      link: entry.link,
      groupName: entry.groupName,
      sharedByName: entry.sharedByName,
    }));
  },
  createClient: (shareLink) => NextcloudApiClient.create(shareLink),
});

export { folderPathFromHref };

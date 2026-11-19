/**
 * `CloudFileProvider` über Google Drive, lesend und FLACH.
 *
 * Die App hat nur den Scope `drive.file`: sie sieht ausschließlich Dateien, die
 * die Person im Google Picker ausgewählt hat (`GET /api/connections/google/picker`)
 * oder die der Grünerator selbst angelegt hat. Es gibt keinen Ordnerbaum und
 * kein „ganzes Drive". Die Wurzel ist deshalb eine flache Liste dieser Dateien,
 * und der Pfad eines Eintrags ist seine Drive-Id (stabil, auflösbar) — der Name
 * steht in `name` bzw. `CloudDownload.name`.
 *
 * Jede Liste trägt einen Hinweis (`CloudListing.note`): eine leere oder dünne
 * Liste heißt hier „nicht ausgewählt", nie „nicht vorhanden".
 *
 * Quellen: https://developers.google.com/workspace/drive/api/reference/rest/v3/files/list,
 * .../files/get (`alt=media`), .../files/export,
 * https://developers.google.com/workspace/drive/api/guides/ref-export-formats
 */
import { createLogger } from '../../utils/logger.js';
import { assertRootRelativePath, CloudPathError } from '../../utils/validation/cloudPaths.js';
import * as drive from '../api-clients/googleDriveClient.js';
import { googleExportMimeType, isConnectFileSupported } from '../connections/connectFileSupport.js';

import { CloudAccessError, guardDriveCall, notFoundError } from './driveErrors.js';
import { findNangoConnectionId, getNangoAccessToken } from './nangoDriveAccess.js';
import {
  type CloudConnectionTest,
  type CloudDownload,
  type CloudEntry,
  type CloudFileProvider,
  type CloudFindQuery,
  type CloudListing,
  type CloudRoot,
} from './types.js';

import type { GoogleDriveFile } from '../api-clients/googleDriveClient.js';

const log = createLogger('GoogleDriveProvider');

export const GOOGLE_DRIVE_MAX_READ_BYTES = 25 * 1024 * 1024;

const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** Drive-Ids bestehen aus Buchstaben, Ziffern, `_` und `-`. */
const DRIVE_ID = /^[a-zA-Z0-9_-]+$/;

/** Steht in jeder Liste — siehe Kopfkommentar. */
export const GOOGLE_PICKER_NOTE =
  'Google Drive zeigt hier nur Dateien, die die Person über den Google-Dateiwähler ausgewählt hat („In Google Drive auswählen…" im Chat-Eingabefeld) oder die der Grünerator angelegt hat — nicht das ganze Drive. Eine Datei, die nicht aufgeführt ist, ist deshalb nicht „nicht vorhanden", sondern wahrscheinlich nur nicht ausgewählt: sag der Person, dass sie sie auswählen kann.';

export interface GoogleDriveDeps {
  connectionIdOf(userId: string): Promise<string | null>;
  token(userId: string): Promise<string>;
  listFiles: typeof drive.listAccessibleFiles;
  getFile: typeof drive.getFile;
  downloadFile: typeof drive.downloadFile;
  exportFile: typeof drive.exportDoc;
}

function toEntry(file: GoogleDriveFile): CloudEntry {
  const size = file.size ? Number(file.size) : null;
  return {
    path: file.id,
    name: file.name,
    isDirectory: false,
    size: size !== null && Number.isFinite(size) ? size : null,
    mimeType: file.mimeType,
    lastModified: new Date(file.modifiedTime),
    etag: null,
    isSupported: isConnectFileSupported('google', file.name, file.mimeType),
  };
}

export class GoogleDriveProvider implements CloudFileProvider {
  readonly id = 'google-drive' as const;

  constructor(private readonly deps: GoogleDriveDeps) {}

  async listRoots(userId: string): Promise<CloudRoot[]> {
    const connectionId = await this.deps.connectionIdOf(userId);
    if (!connectionId) return [];
    return [
      {
        connectionId,
        providerId: this.id,
        label: 'Google Drive',
        host: 'drive.google.com',
        origin: 'own',
        isActive: true,
        secret: userId,
      },
    ];
  }

  async #listing(root: CloudRoot, nameContains?: string): Promise<CloudListing> {
    const token = await this.deps.token(root.secret);
    const result = await guardDriveCall(() =>
      this.deps.listFiles(token, nameContains ? { nameContains } : {})
    );
    return {
      entries: result.files.filter((f) => f.mimeType !== FOLDER_MIME).map(toEntry),
      folderCount: 0,
      depthLimited: false,
      truncated: result.nextPageToken !== null,
      note: GOOGLE_PICKER_NOTE,
    };
  }

  async list(root: CloudRoot, path: string): Promise<CloudListing> {
    if (assertRootRelativePath(path)) {
      throw new CloudAccessError(
        'not_found',
        'Google Drive hat hier keine Ordner — list ohne path liefert die ausgewählten Dateien.'
      );
    }
    return this.#listing(root);
  }

  async find(root: CloudRoot, query: CloudFindQuery): Promise<CloudListing> {
    const listing = await this.#listing(root, query.name?.trim() || undefined);
    const extensions = query.extensions?.map((e) =>
      e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`
    );
    if (!extensions?.length) return listing;
    return {
      ...listing,
      entries: listing.entries.filter((entry) =>
        extensions.some((ext) => entry.name.toLowerCase().endsWith(ext))
      ),
    };
  }

  async read(root: CloudRoot, path: string): Promise<CloudDownload> {
    const id = assertRootRelativePath(path);
    if (!id) throw new CloudPathError('read braucht einen Dateipfad.');
    // Der Pfad ist eine Drive-Id; alles andere stammt nicht aus einer Antwort.
    if (!DRIVE_ID.test(id)) throw notFoundError();
    const token = await this.deps.token(root.secret);
    const file = await guardDriveCall(() => this.deps.getFile(token, id));
    if (file.mimeType === FOLDER_MIME) throw notFoundError();

    if (file.mimeType.startsWith('application/vnd.google-apps')) {
      const exportMime = googleExportMimeType(file.mimeType);
      if (!exportMime) {
        throw new CloudAccessError(
          'unsupported',
          'Dieses Google-Format (z. B. Formular oder Zeichnung) lässt sich nicht als Text lesen.'
        );
      }
      const text = await guardDriveCall(() => this.deps.exportFile(token, id, exportMime));
      const buffer = Buffer.from(text, 'utf8');
      return { buffer, mimeType: exportMime, size: buffer.length, name: file.name };
    }

    const size = file.size ? Number(file.size) : 0;
    if (size > GOOGLE_DRIVE_MAX_READ_BYTES) {
      throw new CloudAccessError(
        'too_large',
        `Die Datei ist mit ${Math.round(size / (1024 * 1024))} MB zu groß zum Lesen (Grenze 25 MB).`
      );
    }
    const buffer = await guardDriveCall(() => this.deps.downloadFile(token, id));
    return { buffer, mimeType: file.mimeType, size: buffer.length, name: file.name };
  }

  async test(target: CloudRoot | { link: string }): Promise<CloudConnectionTest> {
    if (!('secret' in target)) return { ok: false, errorCode: 'invalid_link' };
    try {
      const listing = await this.#listing(target);
      return { ok: true, entryCount: listing.entries.length };
    } catch (err) {
      log.warn('Google Drive test failed', err);
      if (err instanceof CloudAccessError && err.kind === 'reauth') {
        return { ok: false, errorCode: 'forbidden' };
      }
      return { ok: false, errorCode: 'unknown' };
    }
  }
}

export const googleDriveProvider = new GoogleDriveProvider({
  connectionIdOf: (userId) => findNangoConnectionId(userId, 'google'),
  token: (userId) => getNangoAccessToken(userId, 'google'),
  listFiles: drive.listAccessibleFiles,
  getFile: drive.getFile,
  downloadFile: drive.downloadFile,
  exportFile: drive.exportDoc,
});

import {
  type VersionError,
  type VersionResult,
  type VersionSnapshot,
  type VersionStorage,
} from '@blocknote/core/extensions';

import { type DocsApiClient } from '../context/DocsContext';

/** One row of `GET /docs/:id/snapshots` (auto-saves within 30 min are grouped server-side). */
interface SnapshotRow {
  version: number;
  created_at: string;
  is_auto_save: boolean;
  label: string | null;
  created_by: string | null;
  snapshot_count: number;
}

/**
 * Maps the expected failures of our API onto BlockNote's typed version errors.
 * Anything else is a bug and rejects, as the VersionStorage contract asks.
 */
function toVersionError(error: unknown): VersionError | null {
  if (error instanceof TypeError) return { type: 'network' };
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status !== 'number') return null;
  if (status === 401 || status === 403) return { type: 'forbidden' };
  if (status === 404) return { type: 'not-found' };
  if (status === 409) return { type: 'conflict' };
  if (status >= 500) return { type: 'server', status };
  return null;
}

async function attempt<T>(run: () => Promise<T>): Promise<VersionResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error: unknown) {
    const versionError = toVersionError(error);
    if (versionError) return { ok: false, error: versionError };
    throw error;
  }
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toSnapshot(row: SnapshotRow): VersionSnapshot {
  return {
    id: String(row.version),
    createdAt: new Date(row.created_at).getTime(),
    ...(row.label && { name: row.label }),
    ...(row.created_by && { by: row.created_by }),
    ...(row.snapshot_count > 1 && { secondaryLabel: `${row.snapshot_count} Änderungen` }),
  };
}

/**
 * BlockNote version history backed by `yjs_document_snapshots`, which already
 * stores the Yjs state BlockNote's Yjs 13 versioning expects.
 *
 * Restore runs on the server against the live document (it saves the current
 * content first), so no client applies an old version over edits it has not
 * seen yet. There is no `remove`: deleting a snapshot can delete the base the
 * document is loaded from.
 *
 * `canEdit` is read on every access, so a permission change applies without
 * recreating the editor; viewers get a history without write actions.
 */
export function createSnapshotVersionStorage(
  apiClient: DocsApiClient,
  documentId: string,
  canEdit: () => boolean
): VersionStorage<Uint8Array> {
  const base = `/docs/${documentId}/snapshots`;

  const create: NonNullable<VersionStorage<Uint8Array>['create']> = (_content, name) =>
    // The server snapshots the live document as Hocuspocus holds it, which is
    // at least as new as the client's capture.
    attempt(async () => {
      const created = await apiClient.post<{ version: number; created_at: string }>(base, {
        label: name ?? null,
      });
      return {
        id: String(created.version),
        createdAt: new Date(created.created_at).getTime(),
        ...(name && { name }),
      };
    });

  const restore: NonNullable<VersionStorage<Uint8Array>['restore']> = (id) =>
    attempt(async () => {
      await apiClient.post(`${base}/${id}/restore`, { apply: 'live' });
    });

  const rename: NonNullable<VersionStorage<Uint8Array>['rename']> = (id, name) =>
    attempt(async () => {
      await apiClient.put(`${base}/${id}`, { label: name ?? null });
    });

  return {
    list: () =>
      attempt(async () => {
        const data = await apiClient.get<{ snapshots: SnapshotRow[] }>(base);
        return { snapshots: data.snapshots.map(toSnapshot) };
      }),
    getContent: (id) =>
      attempt(async () => {
        const data = await apiClient.get<{ update: string }>(`${base}/${id}/content`);
        return decodeBase64(data.update);
      }),
    get create() {
      return canEdit() ? create : undefined;
    },
    get restore() {
      return canEdit() ? restore : undefined;
    },
    get rename() {
      return canEdit() ? rename : undefined;
    },
  };
}

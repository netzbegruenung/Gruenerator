import {
  type VersionError,
  type VersionResult,
  type VersionSnapshot,
  type VersionSnapshotPage,
  type VersionStorage,
} from '@blocknote/core/extensions';
import { getContractsClient } from '@gruenerator/shared/api';

type SnapshotsApi = ReturnType<typeof getContractsClient>['docSnapshots'];
type SnapshotRow = Extract<
  Awaited<ReturnType<SnapshotsApi['list']>>,
  { status: 200 }
>['body']['snapshots'][number];

/** The contract's non-2xx answers, as BlockNote's typed version errors. */
function failure(status: number): { ok: false; error: VersionError } {
  if (status === 401 || status === 403) return { ok: false, error: { type: 'forbidden' } };
  if (status === 404) return { ok: false, error: { type: 'not-found' } };
  if (status === 409) return { ok: false, error: { type: 'conflict' } };
  return { ok: false, error: { type: 'server', status } };
}

const NETWORK_FAILURE = { ok: false, error: { type: 'network' } } as const;

/**
 * Every HTTP answer comes back as a value (see the contracts client's fetcher);
 * only a request that never got one throws. That is the one expected failure
 * left to catch, as `null` — anything else is a bug and rejects, as the
 * VersionStorage contract asks.
 */
async function send<R>(request: () => Promise<R>): Promise<R | null> {
  try {
    return await request();
  } catch (error: unknown) {
    const isNetworkError =
      (error as { isAxiosError?: boolean } | null)?.isAxiosError === true &&
      !(error as { response?: unknown }).response;
    if (isNetworkError) return null;
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
  documentId: string,
  canEdit: () => boolean
): VersionStorage<Uint8Array> {
  const api = () => getContractsClient().docSnapshots;
  const params = (id: string) => ({ id: documentId, version: Number(id) });

  const create: NonNullable<VersionStorage<Uint8Array>['create']> = async (_content, name) => {
    // The server snapshots the live document as Hocuspocus holds it, which is
    // at least as new as the client's capture.
    const res = await send(() =>
      api().create({ params: { id: documentId }, body: { label: name ?? null } })
    );
    if (!res) return NETWORK_FAILURE;
    if (res.status !== 201) return failure(res.status);
    return {
      ok: true,
      value: {
        id: String(res.body.version),
        createdAt: new Date(res.body.created_at).getTime(),
        ...(name && { name }),
      },
    };
  };

  const restore: NonNullable<VersionStorage<Uint8Array>['restore']> = async (id) => {
    const res = await send(() => api().restore({ params: params(id), body: { apply: 'live' } }));
    if (!res) return NETWORK_FAILURE;
    return res.status === 200 ? { ok: true, value: undefined } : failure(res.status);
  };

  const rename: NonNullable<VersionStorage<Uint8Array>['rename']> = async (id, name) => {
    const res = await send(() =>
      api().rename({ params: params(id), body: { label: name ?? null } })
    );
    if (!res) return NETWORK_FAILURE;
    return res.status === 200 ? { ok: true, value: undefined } : failure(res.status);
  };

  return {
    list: async (_signal, cursor): Promise<VersionResult<VersionSnapshotPage>> => {
      const res = await send(() =>
        api().list({
          params: { id: documentId },
          query: cursor === undefined ? {} : { cursor: Number(cursor) },
        })
      );
      if (!res) return NETWORK_FAILURE;
      if (res.status !== 200) return failure(res.status);
      return {
        ok: true,
        value: {
          snapshots: res.body.snapshots.map(toSnapshot),
          ...(res.body.next_cursor !== null && { nextCursor: res.body.next_cursor }),
        },
      };
    },
    getContent: async (id): Promise<VersionResult<Uint8Array>> => {
      const res = await send(() => api().getContent({ params: params(id) }));
      if (!res) return NETWORK_FAILURE;
      if (res.status !== 200) return failure(res.status);
      return { ok: true, value: decodeBase64(res.body.update) };
    },
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

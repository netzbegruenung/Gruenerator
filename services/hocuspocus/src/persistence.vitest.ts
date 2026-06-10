import { gzipSync } from 'zlib';

import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { PostgresPersistence } from './persistence.js';

import type { DbQueryFn } from './types.js';

const DOC_ID = '00000000-0000-0000-0000-000000000001';

function encodeState(text: string): Buffer {
  const ydoc = new Y.Doc();
  ydoc.getMap('test').set('content', text);
  return Buffer.from(Y.encodeStateAsUpdate(ydoc));
}

function gzippedState(text: string): Buffer {
  return gzipSync(encodeState(text));
}

function decodeContent(state: Uint8Array): string {
  const ydoc = new Y.Doc();
  Y.applyUpdate(ydoc, state);
  return ydoc.getMap('test').get('content') as string;
}

interface MockRows {
  snapshots?: { snapshot_data: Buffer; version: number; created_at: string }[];
  updates?: { update_data: Buffer }[];
  init?: { init_data: Buffer }[];
}

/** Minimal DbQueryFn double dispatching on the table referenced in the SQL. */
function mockDb(rows: MockRows): DbQueryFn {
  return async (sql: string, params?: unknown[]) => {
    if (sql.includes('FROM yjs_document_snapshots')) {
      const offset = (params?.[1] as number) ?? 0;
      const row = (rows.snapshots ?? [])[offset];
      return row ? [row as unknown as Record<string, unknown>] : [];
    }
    if (sql.includes('FROM yjs_document_updates')) {
      return (rows.updates ?? []) as unknown as Record<string, unknown>[];
    }
    if (sql.includes('collaborative_documents_init')) {
      return (rows.init ?? []) as unknown as Record<string, unknown>[];
    }
    return [];
  };
}

describe('PostgresPersistence.loadDocument', () => {
  it('returns null for a genuinely new document (no rows anywhere)', async () => {
    const persistence = new PostgresPersistence(mockDb({}));
    await expect(persistence.loadDocument(DOC_ID)).resolves.toBeNull();
  });

  it('loads the latest snapshot plus the current-state row', async () => {
    const persistence = new PostgresPersistence(
      mockDb({
        snapshots: [
          { snapshot_data: gzippedState('snapshot-v2'), version: 2, created_at: '2026-01-02' },
        ],
        updates: [{ update_data: gzippedState('live-state') }],
      })
    );
    const state = await persistence.loadDocument(DOC_ID);
    expect(state).not.toBeNull();
    expect(decodeContent(state!)).toBe('live-state');
  });

  it('falls back to an older snapshot when the latest one is corrupted', async () => {
    const persistence = new PostgresPersistence(
      mockDb({
        snapshots: [
          { snapshot_data: Buffer.from('not gzip'), version: 2, created_at: '2026-01-02' },
          { snapshot_data: gzippedState('snapshot-v1'), version: 1, created_at: '2026-01-01' },
        ],
      })
    );
    const state = await persistence.loadDocument(DOC_ID);
    expect(state).not.toBeNull();
    expect(decodeContent(state!)).toBe('snapshot-v1');
  });

  it('recovers from the full-state update row when all snapshots are corrupted', async () => {
    const persistence = new PostgresPersistence(
      mockDb({
        snapshots: [
          { snapshot_data: Buffer.from('not gzip'), version: 1, created_at: '2026-01-01' },
        ],
        updates: [{ update_data: gzippedState('live-state') }],
      })
    );
    const state = await persistence.loadDocument(DOC_ID);
    expect(state).not.toBeNull();
    expect(decodeContent(state!)).toBe('live-state');
  });

  it('throws when stored rows exist but none are readable (never serves an empty doc)', async () => {
    const persistence = new PostgresPersistence(
      mockDb({
        snapshots: [
          { snapshot_data: Buffer.from('not gzip'), version: 1, created_at: '2026-01-01' },
        ],
        updates: [{ update_data: Buffer.from('also not gzip') }],
      })
    );
    await expect(persistence.loadDocument(DOC_ID)).rejects.toThrow(/unreadable/);
  });

  it('hydrates from init_data when no snapshots or updates exist', async () => {
    const persistence = new PostgresPersistence(
      mockDb({ init: [{ init_data: gzippedState('seeded') }] })
    );
    const state = await persistence.loadDocument(DOC_ID);
    expect(state).not.toBeNull();
    expect(decodeContent(state!)).toBe('seeded');
  });
});

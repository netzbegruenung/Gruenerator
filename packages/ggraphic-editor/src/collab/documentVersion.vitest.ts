// SPDX-License-Identifier: MPL-2.0
import { createMigrationRegistry, type CoreMigration } from '@ggraphic/schema';
import {
  STAMP_STATE_KEY,
  STAMP_V2_STEP,
  V2_CORE_STEP,
} from '@ggraphic/schema/document/__fixtures__/v2Fixture';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import {
  migrateYDocument,
  readYDocRefusal,
  readYDocVersions,
  stampYDocument,
} from '@ggraphic/editor/collab/documentVersion';
import { getMetaMap, seedPagesIfEmpty, serializeDeck } from '@ggraphic/editor/collab/pagesDoc';
import { YDOC_KEYS } from '@ggraphic/editor/collab/ydocKeys';

const v2Registry = () => {
  const registry = createMigrationRegistry([V2_CORE_STEP]);
  registry.registerStateKey(STAMP_STATE_KEY, [STAMP_V2_STEP]);
  return registry;
};

const v1Registry = () => {
  const registry = createMigrationRegistry([]);
  registry.registerStateKey(STAMP_STATE_KEY, []);
  return registry;
};

function v1Doc(): Y.Doc {
  const doc = new Y.Doc();
  seedPagesIfEmpty(doc, [
    {
      id: 'p1',
      configId: 'freeform',
      state: {
        backgroundColor: '#123456',
        stampInstances: [{ id: 's1', label: 'A', offset: { x: 1, y: 2 } }],
      },
    },
    { id: 'p2', configId: 'freeform', state: { headline: 'x' } },
  ]);
  return doc;
}

/** Two docs kept in sync by applying each other's updates (a fake network). */
function syncedPair(): [Y.Doc, Y.Doc] {
  const a = new Y.Doc();
  const b = new Y.Doc();
  a.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') Y.applyUpdate(b, update, 'remote');
  });
  b.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin !== 'remote') Y.applyUpdate(a, update, 'remote');
  });
  return [a, b];
}

const countUpdates = (doc: Y.Doc, run: () => void): number => {
  let n = 0;
  const on = () => (n += 1);
  doc.on('update', on);
  run();
  doc.off('update', on);
  return n;
};

describe('a v1 Y.Doc under the v1 core', () => {
  it('reads as version 1 without any stamp', () => {
    const doc = v1Doc();
    expect(getMetaMap(doc).has(YDOC_KEYS.schemaVersion)).toBe(false);
    expect(readYDocVersions(doc).schemaVersion).toBe(1);
  });

  it('migrates by writing nothing at all', () => {
    const doc = v1Doc();
    const before = Y.encodeStateAsUpdate(doc);
    let status = '';
    const updates = countUpdates(doc, () => {
      status = migrateYDocument(doc).status;
    });
    expect(status).toBe('current');
    expect(updates).toBe(0);
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });

  it('stamps on seed, only upwards', () => {
    const doc = new Y.Doc();
    stampYDocument(doc);
    expect(getMetaMap(doc).get(YDOC_KEYS.schemaVersion)).toBe(1);
    getMetaMap(doc).set(YDOC_KEYS.schemaVersion, 5);
    stampYDocument(doc);
    expect(getMetaMap(doc).get(YDOC_KEYS.schemaVersion)).toBe(5);
  });
});

describe('the test-only v1 → v2 chain on a Y.Doc', () => {
  it('lifts the pages in place and stamps the versions', () => {
    const doc = v1Doc();
    const result = migrateYDocument(doc, v2Registry());
    expect(result.status).toBe('migrated');
    expect(serializeDeck(doc)).toEqual([
      {
        id: 'p1',
        configId: 'freeform',
        state: {
          background: { color: '#123456' },
          stampInstances: [{ id: 's1', label: 'A', position: { x: 1, y: 2 } }],
        },
        config: {},
      },
      { id: 'p2', configId: 'freeform', state: { headline: 'x' }, config: {} },
    ]);
    const meta = getMetaMap(doc);
    expect(meta.get(YDOC_KEYS.schemaVersion)).toBe(2);
    expect(meta.get(`${YDOC_KEYS.kindVersionPrefix}${STAMP_STATE_KEY}`)).toBe(2);
  });

  it('keeps the Y.Map identity of the pages and their state', () => {
    const doc = v1Doc();
    const pages = doc.getMap<Y.Map<unknown>>(YDOC_KEYS.pagesById);
    const stateBefore = pages.get('p1')!.get(YDOC_KEYS.state);
    migrateYDocument(doc, v2Registry());
    expect(pages.get('p1')!.get(YDOC_KEYS.state)).toBe(stateBefore);
  });

  it('runs once: a second run writes nothing', () => {
    const doc = v1Doc();
    const registry = v2Registry();
    migrateYDocument(doc, registry);
    let status = '';
    const updates = countUpdates(doc, () => {
      status = migrateYDocument(doc, registry).status;
    });
    expect(status).toBe('current');
    expect(updates).toBe(0);
  });

  it('two clients migrating concurrently converge on one result', () => {
    const [a, b] = syncedPair();
    Y.applyUpdate(a, Y.encodeStateAsUpdate(v1Doc()), 'remote');
    // Offline: both migrate the same v1 state, then exchange updates.
    const offlineA = new Y.Doc();
    const offlineB = new Y.Doc();
    Y.applyUpdate(offlineA, Y.encodeStateAsUpdate(a));
    Y.applyUpdate(offlineB, Y.encodeStateAsUpdate(b));
    migrateYDocument(offlineA, v2Registry());
    migrateYDocument(offlineB, v2Registry());
    Y.applyUpdate(offlineA, Y.encodeStateAsUpdate(offlineB));
    Y.applyUpdate(offlineB, Y.encodeStateAsUpdate(offlineA));
    expect(serializeDeck(offlineA)).toEqual(serializeDeck(offlineB));
    expect(serializeDeck(offlineA)[0]!.state).toEqual({
      background: { color: '#123456' },
      stampInstances: [{ id: 's1', label: 'A', position: { x: 1, y: 2 } }],
    });
    expect(migrateYDocument(offlineA, v2Registry()).status).toBe('current');
  });

  it('refuses a migration that changes the set of pages', () => {
    const dropsPages: CoreMigration = { from: 1, migrate: (d) => ({ ...d, pages: [] }) };
    const doc = v1Doc();
    const before = serializeDeck(doc);
    expect(migrateYDocument(doc, createMigrationRegistry([dropsPages])).status).toBe('invalid');
    expect(serializeDeck(doc)).toEqual(before);
  });
});

describe('a Y.Doc from a newer version', () => {
  it('is refused by a v1 build after a v2 build migrated it', () => {
    const doc = v1Doc();
    migrateYDocument(doc, v2Registry());
    expect(readYDocRefusal(doc, v1Registry())).toMatchObject({
      status: 'newer',
      scope: null,
      version: 2,
      known: 1,
    });
    const before = Y.encodeStateAsUpdate(doc);
    expect(migrateYDocument(doc, v1Registry()).status).toBe('newer');
    expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
  });

  it('is refused for a newer host kind', () => {
    const doc = v1Doc();
    getMetaMap(doc).set(`${YDOC_KEYS.kindVersionPrefix}${STAMP_STATE_KEY}`, 3);
    expect(readYDocRefusal(doc, v1Registry())).toMatchObject({
      status: 'newer',
      scope: STAMP_STATE_KEY,
    });
  });

  it('is refused for a malformed stamp', () => {
    const doc = v1Doc();
    getMetaMap(doc).set(YDOC_KEYS.schemaVersion, 'two');
    expect(readYDocRefusal(doc)?.status).toBe('invalid');
  });

  it('accepts its own version', () => {
    const doc = v1Doc();
    migrateYDocument(doc, v2Registry());
    expect(readYDocRefusal(doc, v2Registry())).toBeNull();
  });
});

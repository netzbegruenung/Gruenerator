import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { createHocuspocusServer } from './server.js';
import { SITE_NOT_SEEDED, applySiteSeed } from './siteRooms.js';

import type { AuthService } from './auth.js';
import type { PostgresPersistence } from './persistence.js';

const SITE_ID = '3f2b8c1e-4d5a-4b6c-9e7f-0a1b2c3d4e5f';
const ROOM = `site-${SITE_ID}`;

/** Persistence double keeping full states in memory, keyed by room. */
function memoryPersistence() {
  const rows = new Map<string, Uint8Array>();
  const persistence = {
    loadDocument: async (room: string) => rows.get(room) ?? null,
    storeDocument: async (room: string, state: Uint8Array) => {
      rows.set(room, state);
    },
    hasStoredState: async (room: string) => rows.has(room),
    initializeWithTemplate: async () => {},
    updateCanvasPageCount: async () => {},
    touchUpdatedAt: async () => {},
    updateContentPreview: async () => {},
  };
  return { rows, persistence: persistence as unknown as PostgresPersistence };
}

const ownerAuth = {
  authenticateConnection: async () => ({
    authenticated: true,
    userId: 'owner-1',
    userName: 'Owner',
    readOnly: false,
  }),
} as unknown as AuthService;

/** `user_sites` lookup double: the site is live. */
const liveSiteDb = async () => [{ '?column?': 1 }];

function seedUpdate(title: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getMap('siteMeta').set('title', title);
  // The block order is the seed mark (siteRooms `hasCurrentSeed`).
  doc.getArray('siteBlockOrder').push([`hero-${title}`]);
  return Y.encodeStateAsUpdate(doc);
}

describe('site rooms: a client never edits an unseeded draft', () => {
  function setup() {
    const { rows, persistence } = memoryPersistence();
    const server = createHocuspocusServer({
      port: 0,
      host: '127.0.0.1',
      persistence,
      auth: ownerAuth,
      db: liveSiteDb,
    });
    const authenticate = () => {
      const connectionConfig = { readOnly: true, isAuthenticated: false };
      const payload = {
        documentName: ROOM,
        requestHeaders: new Headers(),
        requestParameters: new URLSearchParams(),
        token: 'token',
        connectionConfig,
        context: {},
        instance: server.hocuspocus,
      };
      return {
        connectionConfig,
        result: server.hocuspocus.hooks('onAuthenticate', payload as never),
      };
    };
    const seed = async (title: string, keepOpen = false) => {
      const connection = await server.hocuspocus.openDirectConnection(ROOM);
      let seeded = false;
      await connection.transact((doc) => {
        seeded = applySiteSeed(doc, seedUpdate(title));
      });
      if (!keepOpen) await connection.disconnect();
      return { seeded, connection };
    };
    return { rows, server, authenticate, seed };
  }

  it('an owner connecting to an unseeded room cannot write; after the seed, the owner can', async () => {
    const { rows, authenticate, seed } = setup();

    await expect(authenticate().result).rejects.toThrow(SITE_NOT_SEEDED);

    expect((await seed('Erste')).seeded).toBe(true);
    expect(rows.has(ROOM)).toBe(true);

    const after = authenticate();
    await expect(after.result).resolves.not.toThrow();
    expect(after.connectionConfig.readOnly).toBe(false);
  });

  it('refuses a client while the seed connection holds an empty live doc', async () => {
    const { server, authenticate } = setup();
    const connection = await server.hocuspocus.openDirectConnection(ROOM);

    await expect(authenticate().result).rejects.toThrow(SITE_NOT_SEEDED);

    await connection.transact((doc) => {
      applySiteSeed(doc, seedUpdate('Erste'));
    });
    await expect(authenticate().result).resolves.not.toThrow();
    await connection.disconnect();
  });

  it('the seed still lands on a room a client was refused from', async () => {
    const { authenticate, seed, server } = setup();
    await expect(authenticate().result).rejects.toThrow(SITE_NOT_SEEDED);
    expect((await seed('Erste')).seeded).toBe(true);
    expect((await seed('Zweite')).seeded).toBe(false);
    const connection = await server.hocuspocus.openDirectConnection(ROOM);
    await connection.transact((doc) => {
      expect(doc.getMap('siteMeta').get('title')).toBe('Erste');
    });
    await connection.disconnect();
  });
});

describe('site rooms: a store never resurrects a trashed or purged site', () => {
  const SQL_LIVE = 'SELECT 1 FROM user_sites WHERE id = $1 AND deleted_at IS NULL LIMIT 1';

  function setup(live: boolean) {
    const { rows, persistence } = memoryPersistence();
    const queries: { sql: string; params: unknown[] | undefined }[] = [];
    const server = createHocuspocusServer({
      port: 0,
      host: '127.0.0.1',
      persistence,
      auth: ownerAuth,
      db: async (sql, params) => {
        queries.push({ sql, params });
        return live ? [{ '?column?': 1 }] : [];
      },
    });
    const closes: { code: number; reason: string }[] = [];
    const connection = () => ({
      close: (event: { code: number; reason: string }) => void closes.push(event),
      webSocket: { close: () => {} },
      context: {},
    });
    const document = new Y.Doc() as Y.Doc & { getConnections: () => unknown[] };
    document.getMap('siteMeta').set('title', 'Entwurf');
    document.getConnections = () => [connection(), connection()];
    server.hocuspocus.documents.set(ROOM, document as never);
    const store = () =>
      server.hocuspocus.hooks('onStoreDocument', { documentName: ROOM, document } as never);
    return { rows, queries, closes, store };
  }

  it('drops the store and closes every connection when the row is missing or trashed', async () => {
    const { rows, queries, closes, store } = setup(false);
    await store();
    await store();
    expect(rows.has(ROOM)).toBe(false);
    expect(queries[0]).toEqual({ sql: SQL_LIVE, params: [SITE_ID] });
    expect(closes).toHaveLength(4);
    expect(closes.every((c) => c.code === 4205)).toBe(true);
  });

  it('stores as before when the site is live', async () => {
    const { rows, closes, store } = setup(true);
    await store();
    expect(rows.has(ROOM)).toBe(true);
    expect(closes).toHaveLength(0);
  });
});

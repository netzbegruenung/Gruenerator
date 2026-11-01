import { useCollaboration } from '@gruenerator/collab';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Characterisation of what the Grünerator's collaboration hook persists and how
// it reacts to the Hocuspocus server. The IndexedDB name `gruenerator-doc-<id>`
// and the registry key `gruenerator-doc-cache-registry` are F0: they live in
// users' browsers, and a different name orphans every offline document cache.

interface FakeProvider {
  options: Record<string, unknown>;
  awarenessUser: unknown;
  disconnect: ReturnType<typeof vi.fn>;
  emit: (event: string, data: unknown) => void;
}
interface FakeIdb {
  name: string;
  destroy: ReturnType<typeof vi.fn>;
  failOpen: (error: unknown) => void;
}

const providers: FakeProvider[] = [];
const idbs: FakeIdb[] = [];

vi.mock('@hocuspocus/provider', () => ({
  HocuspocusProvider: class {
    options: Record<string, unknown>;
    awarenessUser: unknown = null;
    awareness = {
      setLocalStateField: (_field: string, value: unknown) => {
        this.awarenessUser = value;
      },
      setLocalState: () => {},
    };
    disconnect = vi.fn();
    private handlers = new Map<string, (data: unknown) => void>();
    constructor(options: Record<string, unknown>) {
      this.options = options;
      providers.push(this as unknown as FakeProvider);
    }
    on(event: string, handler: (data: unknown) => void) {
      this.handlers.set(event, handler);
    }
    emit(event: string, data: unknown) {
      this.handlers.get(event)?.(data);
    }
    connect() {}
    destroy() {}
  },
}));
vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    name: string;
    synced = false;
    whenSynced = new Promise(() => {});
    _db: Promise<unknown>;
    failOpen!: (error: unknown) => void;
    destroy = vi.fn();
    constructor(name: string) {
      this.name = name;
      this._db = new Promise((_resolve, reject) => {
        this.failOpen = reject;
      });
      idbs.push(this as unknown as FakeIdb);
    }
    on() {}
  },
}));

const REGISTRY_KEY = 'gruenerator-doc-cache-registry';
const config = { url: 'ws://test', getToken: () => Promise.resolve('tok') };
const user = { id: 'u1', display_name: 'Ada' };
let deleted: string[];

beforeEach(() => {
  providers.length = 0;
  idbs.length = 0;
  deleted = [];
  localStorage.clear();
  vi.stubGlobal('indexedDB', { deleteDatabase: (name: string) => deleted.push(name) });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function connect(documentId: string, extra: Record<string, unknown> = {}) {
  const hook = renderHook(() => useCollaboration({ documentId, user, config, ...extra }));
  await waitFor(() => expect(hook.result.current.provider).not.toBeNull());
  return { hook, provider: providers.at(-1)! };
}

describe('Grünerator collaboration storage keys (F0)', () => {
  it('opens the IndexedDB cache as gruenerator-doc-<id> and registers it', async () => {
    const { provider } = await connect('doc-1');
    expect(idbs.map((idb) => idb.name)).toEqual(['gruenerator-doc-doc-1']);
    const registry = JSON.parse(localStorage.getItem(REGISTRY_KEY)!) as Array<{
      documentId: string;
    }>;
    expect(registry.map((entry) => entry.documentId)).toEqual(['doc-1']);
    expect(provider.options).toMatchObject({ url: 'ws://test', name: 'doc-1', token: 'tok' });
  });

  it('evicts beyond 50 cached docs by deleting the oldest gruenerator-doc-* database', async () => {
    localStorage.setItem(
      REGISTRY_KEY,
      JSON.stringify(
        Array.from({ length: 50 }, (_, i) => ({ documentId: `old-${i}`, lastAccess: i + 1 }))
      )
    );
    await connect('doc-new');
    expect(deleted).toEqual(['gruenerator-doc-old-0']);
    expect(JSON.parse(localStorage.getItem(REGISTRY_KEY)!)).toHaveLength(50);
  });

  it('keeps chat and group-presence rooms out of IndexedDB', async () => {
    const chat = await connect('chat-t1');
    expect(chat.hook.result.current.isLocalLoaded).toBe(true);
    await connect('group-presence-g1');
    expect(idbs).toEqual([]);
    expect(localStorage.getItem(REGISTRY_KEY)).toBeNull();
  });

  it('drops the cache of the opened database when its open fails', async () => {
    await connect('doc-1');
    await act(async () => idbs[0]!.failOpen(new Error('VersionError')));
    expect(deleted).toEqual(['gruenerator-doc-doc-1']);
  });
});

describe('Grünerator collaboration auth failures', () => {
  it('a deleted document wipes its cache and stops reconnecting', async () => {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify([{ documentId: 'keep', lastAccess: 1 }]));
    const { hook, provider } = await connect('doc-1');
    act(() => provider.emit('authenticationFailed', { reason: 'Document deleted' }));
    expect(idbs[0]!.destroy).toHaveBeenCalled();
    expect(deleted).toEqual(['gruenerator-doc-doc-1']);
    expect(
      (JSON.parse(localStorage.getItem(REGISTRY_KEY)!) as Array<{ documentId: string }>).map(
        (entry) => entry.documentId
      )
    ).toEqual(['keep']);
    expect(provider.disconnect).toHaveBeenCalled();
    expect(hook.result.current.authError).toBe('Document deleted');
  });

  it('a durable rejection without delete/denied keeps the cache but stops reconnecting', async () => {
    const { provider } = await connect('doc-1');
    act(() =>
      provider.emit('authenticationFailed', { reason: 'Document not publicly accessible' })
    );
    expect(deleted).toEqual([]);
    expect(provider.disconnect).toHaveBeenCalled();
  });

  it('a transient server failure keeps retrying', async () => {
    const { hook, provider } = await connect('doc-1');
    act(() => provider.emit('authenticationFailed', { reason: 'Internal authentication error' }));
    expect(deleted).toEqual([]);
    expect(provider.disconnect).not.toHaveBeenCalled();
    expect(hook.result.current.authError).toBe('Internal authentication error');
  });
});

describe('Grünerator collaboration identity', () => {
  it('guests connect without a token, with guest parameters and the default name', async () => {
    const hook = renderHook(() =>
      useCollaboration({ documentId: 'doc-1', user: null, config, isGuest: true, guestId: 'g1' })
    );
    await waitFor(() => expect(hook.result.current.provider).not.toBeNull());
    const provider = providers.at(-1)!;
    expect(provider.options['token']).toBeUndefined();
    expect(provider.options['parameters']).toEqual({ guestId: 'g1', guestName: 'Gast' });
    expect(provider.awarenessUser).toMatchObject({ id: 'g1', name: 'Gast' });
  });

  it('signed-in users publish their name and robot avatar', async () => {
    const { provider } = await connect('doc-1');
    expect(provider.options['parameters']).toBeUndefined();
    expect(provider.awarenessUser).toMatchObject({ id: 'u1', name: 'Ada', avatarRobotId: 1 });
  });

  it('does not connect without a user unless the session is a guest', async () => {
    renderHook(() => useCollaboration({ documentId: 'doc-1', user: null, config }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(providers).toEqual([]);
    expect(idbs).toEqual([]);
  });
});

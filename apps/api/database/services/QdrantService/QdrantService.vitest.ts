/**
 * #3167: `_performInit()` reconciles collections/indexes on every connect,
 * including for read-only scripts. `useQdrantConnectOnly()` lets a script
 * opt out before it reaches the singleton — connection + embedding init
 * still run, only `createCollections`/`createTextSearchIndexes` are skipped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COLLECTION_SCHEMAS } from '../../../config/qdrantCollectionsSchema.js';

const { envMock, created, failingUrls, hangingUrls } = vi.hoisted(() => ({
  envMock: {} as Record<string, unknown>,
  created: [] as FakeQdrantClient[],
  failingUrls: new Set<string>(),
  hangingUrls: new Set<string>(),
}));

interface FakeQdrantClient {
  url: string;
  getCollections: ReturnType<typeof vi.fn>;
  getCollection: ReturnType<typeof vi.fn>;
  createCollection: ReturnType<typeof vi.fn>;
  createPayloadIndex: ReturnType<typeof vi.fn>;
  deletePayloadIndex: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
}

const BASE_ENV = {
  QDRANT_API_KEY: 'test-key',
  QDRANT_URL: 'http://localhost:6333',
  QDRANT_CONTENT_READ_ONLY: false,
};
const CONTENT_URL = 'http://content:6333';

function resetEnv(extra: Record<string, unknown> = {}): void {
  for (const key of Object.keys(envMock)) delete envMock[key];
  Object.assign(envMock, BASE_ENV, extra);
}
resetEnv();

vi.mock('../../../config/env.js', () => ({ env: envMock }));

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class {
    url: string;
    getCollections = vi.fn().mockResolvedValue({ collections: [] });
    getCollection = vi.fn().mockResolvedValue({ payload_schema: {} });
    createCollection = vi.fn().mockResolvedValue(true);
    createPayloadIndex = vi.fn().mockResolvedValue({});
    deletePayloadIndex = vi.fn().mockResolvedValue({});
    query = vi.fn().mockResolvedValue({ points: [] });
    constructor(options: { url?: string; host?: string }) {
      this.url = options.url ?? options.host ?? '';
      if (failingUrls.has(this.url)) {
        this.getCollections.mockRejectedValue(new Error('connect ECONNREFUSED'));
      }
      if (hangingUrls.has(this.url)) {
        this.getCollections.mockReturnValue(new Promise(() => {}));
      }
      created.push(this as unknown as FakeQdrantClient);
    }
  },
}));

vi.mock('../../../services/mistral/index.js', () => ({
  mistralEmbeddingService: {
    init: vi.fn().mockResolvedValue(undefined),
    getDimensions: vi.fn().mockReturnValue(1024),
  },
}));

// Echte Implementierung hinter Spies: die Store-Tests prüfen die Schreibaufrufe
// an den Client-Mocks selbst, nicht nur die Argumente.
vi.mock('./collections.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./collections.js')>();
  return {
    ...actual,
    createCollections: vi.fn(actual.createCollections),
    createTextSearchIndexes: vi.fn(actual.createTextSearchIndexes),
  };
});

const collectionsModule = await import('./collections.js');
const createCollections = vi.mocked(collectionsModule.createCollections);
const createTextSearchIndexes = vi.mocked(collectionsModule.createTextSearchIndexes);

const { QdrantService, useQdrantConnectOnly, ContentStoreReadOnlyError } =
  await import('./QdrantService.js');

const namesOfStore = (store: 'content' | 'instance'): string[] =>
  Object.values(COLLECTION_SCHEMAS)
    .filter((schema) => schema.store === store)
    .map((schema) => schema.name);

const namesCalled = (fn: ReturnType<typeof vi.fn>): string[] =>
  fn.mock.calls.map((call: unknown[]) => call[0] as string);

const clientAt = (url: string): FakeQdrantClient => {
  const client = created.find((c) => c.url === url);
  if (!client) throw new Error(`no client for ${url}`);
  return client;
};

// Steht vor den Reconciliation-Tests: useQdrantConnectOnly() ist modulweit und
// lässt sich nicht zurücksetzen.
describe('QdrantService content and instance stores', () => {
  beforeEach(() => {
    resetEnv();
    created.length = 0;
    failingUrls.clear();
    hangingUrls.clear();
    createCollections.mockClear();
    createTextSearchIndexes.mockClear();
  });

  it('without content target read and write return the same instance client for every store', async () => {
    const service = new QdrantService();
    await service.init();

    expect(created).toHaveLength(1);
    const instance = created[0];
    expect(service.readClient('documents')).toBe(instance);
    expect(service.readClient('landtag_nrw_documents')).toBe(instance);
    expect(service.writeClient('documents')).toBe(instance);
    expect(service.writeClient('bundestag_content')).toBe(instance);
    expect(service.isContentAvailable()).toBe(true);
  });

  it('content collections read from the content client, instance collections from the instance client', async () => {
    resetEnv({
      QDRANT_CONTENT_URL: CONTENT_URL,
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_READ_ONLY: true,
    });
    const service = new QdrantService();
    await service.init();

    expect(service.readClient('landtag_nrw_documents')).toBe(clientAt(CONTENT_URL));
    expect(service.readClient('documents')).toBe(clientAt(BASE_ENV.QDRANT_URL));
    expect(service.readClient('some_unknown_collection')).toBe(clientAt(BASE_ENV.QDRANT_URL));
  });

  it('read-only content target: writeClient on a content collection throws ContentStoreReadOnlyError', async () => {
    resetEnv({
      QDRANT_CONTENT_URL: CONTENT_URL,
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_READ_ONLY: true,
    });
    const service = new QdrantService();
    await service.init();

    expect(() => service.writeClient('landtag_nrw_documents')).toThrow(ContentStoreReadOnlyError);
    expect(service.writeClient('documents')).toBe(clientAt(BASE_ENV.QDRANT_URL));
  });

  it('read-only content target skips reconciliation', async () => {
    resetEnv({
      QDRANT_CONTENT_URL: CONTENT_URL,
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_READ_ONLY: true,
    });
    const service = new QdrantService();
    await service.init();

    const content = clientAt(CONTENT_URL);
    expect(content.createCollection).not.toHaveBeenCalled();
    expect(content.createPayloadIndex).not.toHaveBeenCalled();
    expect(content.deletePayloadIndex).not.toHaveBeenCalled();

    const instance = clientAt(BASE_ENV.QDRANT_URL);
    const instanceNames = new Set(namesOfStore('instance'));
    expect(namesCalled(instance.createCollection).length).toBeGreaterThan(0);
    for (const name of namesCalled(instance.createCollection)) {
      expect(instanceNames.has(name)).toBe(true);
    }
    for (const name of namesCalled(instance.createPayloadIndex)) {
      expect(instanceNames.has(name)).toBe(true);
    }

    expect(createTextSearchIndexes).toHaveBeenCalledTimes(1);
    expect(createTextSearchIndexes.mock.calls[0][2]).toEqual(['documents', 'user_knowledge']);
  });

  it('writable separate content target reconciles content schemas on the content client', async () => {
    resetEnv({
      QDRANT_CONTENT_URL: CONTENT_URL,
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_READ_ONLY: false,
    });
    const service = new QdrantService();
    await service.init();

    const content = clientAt(CONTENT_URL);
    const instance = clientAt(BASE_ENV.QDRANT_URL);
    expect(namesCalled(content.createCollection).sort()).toEqual(namesOfStore('content').sort());
    expect(namesCalled(instance.createCollection).sort()).toEqual(namesOfStore('instance').sort());
    expect(namesCalled(content.createPayloadIndex)).toContain('grundsatz_documents');
    expect(service.writeClient('landtag_nrw_documents')).toBe(content);
  });

  it('content init failure keeps instance usable', async () => {
    resetEnv({
      QDRANT_CONTENT_URL: CONTENT_URL,
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_READ_ONLY: true,
    });
    failingUrls.add(CONTENT_URL);
    const service = new QdrantService();
    await service.init();

    expect(service.isConnected).toBe(true);
    expect(service.isContentAvailable()).toBe(false);
    expect(service.readClient('documents')).toBe(clientAt(BASE_ENV.QDRANT_URL));
    expect(() => service.readClient('landtag_nrw_documents')).toThrow(/content qdrant unavailable/);
  });

  it('operations resolve the current client per call', async () => {
    const service = new QdrantService();
    await service.init();
    const operations = service.operations!;
    const first = created[0];

    first.getCollections.mockRejectedValue(new Error('SSL routines: wrong version number'));
    service.lastHealthCheck = 0;
    await service.ensureConnection();

    expect(created).toHaveLength(2);
    const second = created[1];
    await operations.vectorSearch('documents', [0.1, 0.2], {}, { limit: 1 });
    expect(second.query).toHaveBeenCalled();
    expect(first.query).not.toHaveBeenCalled();
  });

  it('operations keep the old instance client while a non-SSL re-init is in flight', async () => {
    const { mistralEmbeddingService } = await import('../../../services/mistral/index.js');
    const service = new QdrantService();
    await service.init();
    const operations = service.operations!;
    const first = created[0];

    let releaseInit: () => void = () => {};
    vi.mocked(mistralEmbeddingService.init).mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseInit = resolve))
    );
    first.getCollections.mockRejectedValueOnce(new Error('timeout'));
    service.lastHealthCheck = 0;
    const reconnecting = service.ensureConnection();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.isConnected).toBe(false);
    expect(created).toHaveLength(2);
    await operations.vectorSearch('documents', [0.1, 0.2], {}, { limit: 1 });
    expect(first.query).toHaveBeenCalled();
    expect(created[1].query).not.toHaveBeenCalled();

    releaseInit();
    await reconnecting;
    expect(service.isConnected).toBe(true);
    expect(service.readClient('documents')).toBe(created[1]);
  });

  it('instance SSL reconnect also rebuilds the content client', async () => {
    resetEnv({
      QDRANT_CONTENT_URL: CONTENT_URL,
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_READ_ONLY: true,
    });
    const service = new QdrantService();
    await service.init();
    const oldContent = clientAt(CONTENT_URL);

    clientAt(BASE_ENV.QDRANT_URL).getCollections.mockRejectedValue(
      new Error('SSL routines: wrong version number')
    );
    service.lastHealthCheck = 0;
    await service.ensureConnection();

    const contentClients = created.filter((c) => c.url === CONTENT_URL);
    expect(contentClients).toHaveLength(2);
    expect(service.readClient('landtag_nrw_documents')).toBe(contentClients[1]);
    expect(service.readClient('landtag_nrw_documents')).not.toBe(oldContent);
  });

  it('a content host that never answers does not hold up the instance init', async () => {
    resetEnv({
      QDRANT_CONTENT_URL: CONTENT_URL,
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_READ_ONLY: true,
    });
    hangingUrls.add(CONTENT_URL);
    const service = new QdrantService();
    service.contentConnectWaitMs = 20;

    const started = Date.now();
    await service.init();

    expect(Date.now() - started).toBeLessThan(1000);
    expect(service.isConnected).toBe(true);
    expect(service.readClient('documents')).toBe(clientAt(BASE_ENV.QDRANT_URL));
    expect(() => service.readClient('landtag_nrw_documents')).toThrow(/content qdrant unavailable/);
  });

  it('marks the instance connected before the content host answers', async () => {
    resetEnv({
      QDRANT_CONTENT_URL: CONTENT_URL,
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_READ_ONLY: true,
    });
    hangingUrls.add(CONTENT_URL);
    const service = new QdrantService();
    service.contentConnectWaitMs = 10_000;

    const connecting = service.init();
    await vi.waitFor(() => expect(created.some((c) => c.url === CONTENT_URL)).toBe(true));

    expect(service.isAvailableSync()).toBe(true);
    expect(service.readClient('documents')).toBe(clientAt(BASE_ENV.QDRANT_URL));
    expect(() => service.readClient('landtag_nrw_documents')).toThrow(/content qdrant unavailable/);
    service.contentConnectWaitMs = 0;
    void connecting;
  });

  it('client-presence gates stay true while a re-init is in flight', async () => {
    resetEnv({
      QDRANT_CONTENT_URL: CONTENT_URL,
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_READ_ONLY: true,
    });
    const { mistralEmbeddingService } = await import('../../../services/mistral/index.js');
    const service = new QdrantService();
    await service.init();

    let releaseInit: () => void = () => {};
    vi.mocked(mistralEmbeddingService.init).mockImplementationOnce(
      () => new Promise<void>((resolve) => (releaseInit = resolve))
    );
    clientAt(BASE_ENV.QDRANT_URL).getCollections.mockRejectedValueOnce(new Error('timeout'));
    service.lastHealthCheck = 0;
    const reconnecting = service.ensureConnection();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(service.isConnected).toBe(false);
    expect(service.isAvailableSync()).toBe(false);
    expect(service.isContentAvailable()).toBe(true);
    expect(service.hasClientFor('documents')).toBe(true);
    expect(service.hasClientFor('landtag_nrw_documents')).toBe(true);

    releaseInit();
    await reconnecting;
  });

  it('hasClientFor reports a missing content client only for content collections', async () => {
    resetEnv({
      QDRANT_CONTENT_URL: CONTENT_URL,
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_READ_ONLY: true,
    });
    failingUrls.add(CONTENT_URL);
    const service = new QdrantService();
    expect(service.hasClientFor('documents')).toBe(false);
    await service.init();

    expect(service.hasClientFor('documents')).toBe(true);
    expect(service.hasClientFor('landtag_nrw_documents')).toBe(false);
  });
});

describe('QdrantService content reconnect', () => {
  // Only Date is faked: the constructor's setTimeout must still fire normally.
  beforeEach(async () => {
    // Konstruktor-Timer früherer Tests abarbeiten, bevor Date vorgestellt wird.
    await new Promise((resolve) => setTimeout(resolve, 0));
    vi.useFakeTimers({ toFake: ['Date'] });
    resetEnv({
      QDRANT_CONTENT_URL: CONTENT_URL,
      QDRANT_CONTENT_API_KEY: 'content-key',
      QDRANT_CONTENT_READ_ONLY: true,
    });
    created.length = 0;
    failingUrls.clear();
    hangingUrls.clear();
  });
  afterEach(() => vi.useRealTimers());

  const contentClients = (): FakeQdrantClient[] => created.filter((c) => c.url === CONTENT_URL);

  it('a content read after the retry interval reconnects a content host that was down at boot', async () => {
    failingUrls.add(CONTENT_URL);
    const service = new QdrantService();
    await service.init();
    expect(service.isContentAvailable()).toBe(false);

    failingUrls.clear();
    vi.advanceTimersByTime(30_000);
    const bootClient = contentClients().at(-1);
    expect(() => service.readClient('landtag_nrw_documents')).toThrow(/content qdrant unavailable/);

    await vi.waitFor(() => expect(service.isContentAvailable()).toBe(true));
    const reconnected = service.readClient('landtag_nrw_documents') as unknown as FakeQdrantClient;
    expect(reconnected.url).toBe(CONTENT_URL);
    expect(reconnected).not.toBe(bootClient);
  });

  it('init() on a connected service reconnects the content host after the retry interval', async () => {
    failingUrls.add(CONTENT_URL);
    const service = new QdrantService();
    await service.init();

    failingUrls.clear();
    vi.advanceTimersByTime(30_000);
    await service.ensureConnected();

    await vi.waitFor(() => expect(service.isContentAvailable()).toBe(true));
    const reconnected = service.readClient('landtag_nrw_documents') as unknown as FakeQdrantClient;
    expect(reconnected.url).toBe(CONTENT_URL);
  });

  it('retries the content host at most once per interval', async () => {
    failingUrls.add(CONTENT_URL);
    const service = new QdrantService();
    await service.init();
    const attempts = contentClients().length;

    for (let i = 0; i < 5; i++) {
      await service.isAvailable();
      expect(() => service.readClient('landtag_nrw_documents')).toThrow();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(contentClients()).toHaveLength(attempts);
  });

  it('without a content target never builds a second client', async () => {
    resetEnv();
    const service = new QdrantService();
    await service.init();
    vi.advanceTimersByTime(30_000);
    await service.isAvailable();
    service.readClient('landtag_nrw_documents');

    expect(created).toHaveLength(1);
  });
});

describe('QdrantService._performInit reconciliation', () => {
  it('runs collection and index reconciliation by default', async () => {
    const service = new QdrantService();
    await service.init();

    expect(createCollections).toHaveBeenCalledTimes(1);
    expect(createTextSearchIndexes).toHaveBeenCalledTimes(1);
    expect(service.isConnected).toBe(true);
  });

  it('skips reconciliation after useQdrantConnectOnly(), but stays connected', async () => {
    useQdrantConnectOnly();
    createCollections.mockClear();
    createTextSearchIndexes.mockClear();

    const service = new QdrantService();
    await service.init();

    expect(createCollections).not.toHaveBeenCalled();
    expect(createTextSearchIndexes).not.toHaveBeenCalled();
    expect(service.isConnected).toBe(true);
  });
});

describe('QdrantService startup', () => {
  it('reports available once an init() started before the constructor timer connects', async () => {
    const { mistralEmbeddingService } = await import('../../../services/mistral/index.js');
    vi.mocked(mistralEmbeddingService.init).mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );

    const service = new QdrantService();
    const connecting = service.init();
    // Let the constructor's deferred init fire while the first one is still running.
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(service.isAvailable()).resolves.toBe(true);
    await connecting;
  });
});

const { mistralEmbeddingService } = await import('../../../services/mistral/index.js');

describe('QdrantService failed init', () => {
  // Only Date is faked: the constructor's setTimeout must still fire normally.
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
  afterEach(() => vi.useRealTimers());

  it('retries after the reconnect interval instead of keeping the failed attempt', async () => {
    vi.mocked(mistralEmbeddingService.init).mockRejectedValue(new Error('qdrant restarting'));

    const service = new QdrantService();
    await service.init();
    expect(service.isConnected).toBe(false);

    vi.mocked(mistralEmbeddingService.init).mockResolvedValue(undefined);
    vi.advanceTimersByTime(30_000);
    await service.init();
    expect(service.isConnected).toBe(true);
  });

  it('does not retry on every call while Qdrant is down', async () => {
    vi.mocked(mistralEmbeddingService.init).mockRejectedValue(new Error('qdrant restarting'));
    const service = new QdrantService();
    await service.init();
    vi.mocked(mistralEmbeddingService.init).mockClear();

    await service.init();
    await service.isAvailable();

    expect(mistralEmbeddingService.init).not.toHaveBeenCalled();
  });

  it('lets isAvailable() retry after a failed init', async () => {
    vi.mocked(mistralEmbeddingService.init).mockRejectedValue(new Error('qdrant restarting'));

    const service = new QdrantService();
    await expect(service.isAvailable()).resolves.toBe(false);

    vi.mocked(mistralEmbeddingService.init).mockResolvedValue(undefined);
    vi.advanceTimersByTime(30_000);
    await expect(service.isAvailable()).resolves.toBe(true);
  });
});

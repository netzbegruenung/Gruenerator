import { describe, expect, it, vi } from 'vitest';

import { withRemovedSearchCompat } from './qdrantSearchCompat.js';

import type { QdrantClient } from '@qdrant/js-client-rest';

type QueryMock = ReturnType<typeof vi.fn>;

function makeClient(points: unknown[] = []): { client: QdrantClient; query: QueryMock } {
  const query = vi.fn().mockResolvedValue({ points });
  return { client: { query } as unknown as QdrantClient, query };
}

describe('withRemovedSearchCompat', () => {
  it('bildet die entfernte search()-Signatur auf query() ab', async () => {
    const { client, query } = makeClient([{ id: '1', score: 0.9, payload: { data: 'hallo' } }]);
    const patched = withRemovedSearchCompat(client) as QdrantClient & {
      search: (c: string, a: Record<string, unknown>) => Promise<unknown[]>;
    };

    const filter = { must: [{ key: 'user_id', match: { value: 'u1' } }] };
    const result = await patched.search('user_memories', {
      vector: [0.1, 0.2],
      filter,
      limit: 5,
    });

    expect(query).toHaveBeenCalledWith('user_memories', {
      query: [0.1, 0.2],
      filter,
      limit: 5,
      offset: 0,
      with_payload: true,
      with_vector: false,
    });
    // search() lieferte die Trefferliste flach, query() verpackt sie in {points}.
    expect(result).toEqual([{ id: '1', score: 0.9, payload: { data: 'hallo' } }]);
  });

  it('setzt with_payload=true, wenn der Aufrufer es weglässt', async () => {
    // Load-bearing: mem0 übergibt with_payload nie und liest danach
    // hit.payload.data. Ohne den 1.18-Default käme jede Erinnerung leer zurück,
    // statt als Fehler aufzufallen.
    const { client, query } = makeClient();
    const patched = withRemovedSearchCompat(client) as QdrantClient & {
      search: (c: string, a: Record<string, unknown>) => Promise<unknown[]>;
    };

    await patched.search('user_memories', { vector: [0.1] });

    expect(query.mock.calls[0]?.[1]).toMatchObject({
      with_payload: true,
      limit: 10,
      offset: 0,
    });
  });

  it('lässt filter weg, wenn keiner gesetzt ist', async () => {
    const { client, query } = makeClient();
    const patched = withRemovedSearchCompat(client) as QdrantClient & {
      search: (c: string, a: Record<string, unknown>) => Promise<unknown[]>;
    };

    await patched.search('user_memories', { vector: [0.1] });

    expect(query.mock.calls[0]?.[1]).not.toHaveProperty('filter');
  });

  it('rührt einen Client mit eigenem search() nicht an', async () => {
    const native = vi.fn().mockResolvedValue([{ id: 'native' }]);
    const { client, query } = makeClient();
    (client as unknown as { search: unknown }).search = native;

    const patched = withRemovedSearchCompat(client) as QdrantClient & {
      search: (c: string, a: Record<string, unknown>) => Promise<unknown[]>;
    };
    await patched.search('user_memories', { vector: [0.1] });

    expect(native).toHaveBeenCalledOnce();
    expect(query).not.toHaveBeenCalled();
  });

  it('mem0s echter Qdrant-Store kommt durch den geshimmten Client durch', async () => {
    // Der eigentliche Beweis: nicht die Shim-Signatur, sondern mem0s Store,
    // der sie ruft. Ohne Shim wirft dieselbe Zeile
    // "TypeError: this.client.search is not a function".
    const { Qdrant } = await import('mem0ai/oss');
    const { QdrantClient: RealClient } = await import('@qdrant/js-client-rest');

    const query = vi.fn().mockResolvedValue({
      points: [{ id: 'p1', version: 1, score: 0.87, payload: { data: 'mag kurze Texte' } }],
    });
    const client = new RealClient({ url: 'http://localhost:6333', apiKey: 'x' });
    client.query = query as unknown as QdrantClient['query'];

    const store = new Qdrant({
      client: withRemovedSearchCompat(client),
      collectionName: 'user_memories',
      embeddingModelDims: 1024,
    });
    // Collection-Bootstrap überspringen — hier zählt nur der Suchpfad.
    (store as unknown as { initialize: () => Promise<void> }).initialize = async () => {};

    await expect(store.search([0.1, 0.2], 5, { user_id: 'u1' })).resolves.toEqual([
      { id: 'p1', payload: { data: 'mag kurze Texte' }, score: 0.87 },
    ]);
    // mem0 baut den Filter selbst; er muss unverändert bei query() ankommen.
    expect(query.mock.calls[0]?.[1]).toMatchObject({
      query: [0.1, 0.2],
      filter: { must: [{ key: 'user_id', match: { value: 'u1' } }] },
      limit: 5,
      with_payload: true,
    });
  });

  it('der installierte Qdrant-Client hat kein search() mehr — der Shim wird gebraucht', async () => {
    // Kanarienvogel: bringt eine spätere Client-Version search() zurück (oder
    // repariert mem0 seinen Store), schlägt dieser Test fehl und der Shim darf weg.
    const { QdrantClient: RealClient } = await import('@qdrant/js-client-rest');
    const real = new RealClient({ url: 'http://localhost:6333', apiKey: 'x' });

    expect(typeof (real as unknown as { search?: unknown }).search).toBe('undefined');
    expect(typeof real.query).toBe('function');
  });
});

/**
 * #3190: `createCollections()` treated "already exists" as success, so a
 * declared index type change never reached a live collection — every system
 * collection kept `published_at` as `keyword` and `order_by` answered 400.
 * The backfill now compares the live `payload_schema` and drops a stale
 * index before recreating it.
 */
import { describe, expect, it, vi } from 'vitest';

import { getIndexSchema, type CollectionSchema } from '../../../config/qdrantCollectionsSchema.js';

import { createCollections } from './collections.js';

import type { QdrantClient } from '@qdrant/js-client-rest';
import type { Logger } from 'winston';

const log = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

function fakeClient(liveTypes: Record<string, string>) {
  const client = {
    getCollections: vi.fn().mockResolvedValue({ collections: [{ name: 'gruene_de_documents' }] }),
    getCollection: vi.fn().mockResolvedValue({
      payload_schema: Object.fromEntries(
        Object.entries(liveTypes).map(([field, data_type]) => [field, { data_type, points: 1 }])
      ),
    }),
    createCollection: vi.fn(),
    createPayloadIndex: vi.fn().mockRejectedValue(new Error('already exists')),
    deletePayloadIndex: vi.fn().mockResolvedValue({ status: 'acknowledged' }),
  };
  return client;
}

const schemas: Record<string, CollectionSchema> = {
  gruene_de_documents: {
    name: 'gruene_de_documents',
    optimizer: null,
    hnsw: null,
    indexes: [
      { field: 'published_at', type: 'datetime' },
      { field: 'user_id', type: 'keywordTenant' },
    ],
  },
};

async function run(client: ReturnType<typeof fakeClient>): Promise<void> {
  await createCollections(
    client as unknown as QdrantClient,
    1024,
    {} as never,
    schemas,
    vi.fn(),
    getIndexSchema,
    log
  );
}

describe('createCollections index backfill', () => {
  it('drops and recreates an index whose live type differs from the schema', async () => {
    const client = fakeClient({ published_at: 'keyword', user_id: 'keyword' });
    await run(client);

    expect(client.deletePayloadIndex).toHaveBeenCalledTimes(1);
    expect(client.deletePayloadIndex).toHaveBeenCalledWith('gruene_de_documents', 'published_at');
    expect(client.createPayloadIndex).toHaveBeenCalledWith('gruene_de_documents', {
      field_name: 'published_at',
      field_schema: { type: 'datetime' },
    });
    const [deleteOrder] = client.deletePayloadIndex.mock.invocationCallOrder;
    const [createOrder] = client.createPayloadIndex.mock.invocationCallOrder;
    expect(deleteOrder).toBeLessThan(createOrder);
  });

  it('leaves matching types alone, params-only differences included', async () => {
    const client = fakeClient({ published_at: 'datetime', user_id: 'keyword' });
    await run(client);

    expect(client.deletePayloadIndex).not.toHaveBeenCalled();
    expect(client.createPayloadIndex).toHaveBeenCalledTimes(2);
    expect(client.createCollection).not.toHaveBeenCalled();
  });
});

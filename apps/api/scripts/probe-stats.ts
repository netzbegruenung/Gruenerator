/**
 * One-off probe: hit the exact Qdrant calls the notebook stats service makes,
 * print the precise error/result for each. Run with:
 *   pnpm --filter @gruenerator/api exec tsx scripts/probe-stats.ts
 */
import 'dotenv/config';
import {
  getQdrantInstance,
  useQdrantConnectOnly,
} from '../database/services/QdrantService/index.js';

const COLLECTION = 'landesverbaende_documents';
const FILTER = {
  must: [{ key: 'landesverband', match: { any: ['BE', 'BE-F'] } }],
};

async function step<T>(name: string, fn: () => Promise<T>) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const dt = Date.now() - t0;
    console.log(`✓ ${name} (${dt}ms):`, JSON.stringify(result, null, 2).slice(0, 600));
    return result;
  } catch (err) {
    const dt = Date.now() - t0;
    const e = err as { message?: string; status?: number; data?: unknown };
    console.log(`✗ ${name} (${dt}ms): ${e.message ?? err}`);
    if (e.data) console.log(`  data: ${JSON.stringify(e.data).slice(0, 600)}`);
    if (e.status) console.log(`  status: ${e.status}`);
    return null;
  }
}

async function main() {
  useQdrantConnectOnly();
  const qdrant = getQdrantInstance();
  await qdrant.init();
  const client = qdrant.client!;

  await step('count(filter) [all chunks]', () =>
    client.count(COLLECTION, { filter: FILTER as never, exact: true })
  );

  const filterChunk0 = {
    must: [...FILTER.must, { key: 'chunk_index', match: { value: 0 } }],
  };
  await step('count(filter ∧ chunk_index=0) [unique docs]', () =>
    client.count(COLLECTION, { filter: filterChunk0 as never, exact: true })
  );

  await step('scroll(filter, no order_by, limit 3)', () =>
    client.scroll(COLLECTION, {
      filter: FILTER as never,
      limit: 3,
      with_payload: true,
      with_vector: false,
    })
  );

  await step('scroll(filter, order_by published_at desc, limit 3)', () =>
    client.scroll(COLLECTION, {
      filter: FILTER as never,
      limit: 3,
      with_payload: true,
      with_vector: false,
      order_by: { key: 'published_at', direction: 'desc' as const },
    })
  );

  await step('scroll(filter, order_by indexed_at desc, limit 3)', () =>
    client.scroll(COLLECTION, {
      filter: FILTER as never,
      limit: 3,
      with_payload: true,
      with_vector: false,
      order_by: { key: 'indexed_at', direction: 'desc' as const },
    })
  );

  await step('facet primary_category', () =>
    qdrant.getFieldValueCounts(COLLECTION, 'primary_category', 10, FILTER as never)
  );

  await step('facet content_type', () =>
    qdrant.getFieldValueCounts(COLLECTION, 'content_type', 10, FILTER as never)
  );

  await step('facet content_type WITH chunk_index=0', () =>
    qdrant.getFieldValueCounts(COLLECTION, 'content_type', 10, filterChunk0 as never)
  );

  await step('facet content_type_label', () =>
    qdrant.getFieldValueCounts(COLLECTION, 'content_type_label', 10, FILTER as never)
  );

  await step('facet source_id', () =>
    qdrant.getFieldValueCounts(COLLECTION, 'source_id', 10, FILTER as never)
  );

  process.exit(0);
}

main().catch((err) => {
  console.error('main failed:', err);
  process.exit(1);
});

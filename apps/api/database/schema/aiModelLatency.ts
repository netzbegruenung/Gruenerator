import { type InferSelectModel } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Gemessener Durchsatz je Provider/Modell, ein Eintrag pro Fünf-Minuten-Fenster
 * und Cluster-Worker. Geschrieben nur von services/ai/modelLatencyStore.ts.
 */
export const aiModelLatency = pgTable(
  'ai_model_latency',
  {
    bucketStart: timestamp('bucket_start', { withTimezone: true }).notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    /** Cluster-Worker-ID. Zwei p50 lassen sich nicht addieren. */
    worker: smallint('worker').notNull().default(0),
    samples: integer('samples').notNull().default(0),
    slowVerdicts: integer('slow_verdicts').notNull().default(0),
    p50TokensPerSec: doublePrecision('p50_tokens_per_sec'),
    p50TtftMs: integer('p50_ttft_ms'),
  },
  (t) => [
    primaryKey({
      name: 'ai_model_latency_pk',
      columns: [t.bucketStart, t.provider, t.model, t.worker],
    }),
    index('idx_ai_model_latency_lookup').on(t.provider, t.model, t.bucketStart),
  ]
);

export type AiModelLatencyRow = InferSelectModel<typeof aiModelLatency>;

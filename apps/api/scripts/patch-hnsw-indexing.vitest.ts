import { describe, expect, it } from 'vitest';

import {
  type CollectionIndexInfo,
  parseCliArgs,
  planHnswPatch,
  selectTargets,
} from './patch-hnsw-indexing.js';

// landesverbaende_documents' live (working) config — 10000 against 20000, per
// the schema comment in qdrantCollectionsSchema.ts.
const MEDIUM_PRESET = { indexing_threshold: 10000, max_segment_size: 20000 };

// `large`'s ceiling after the raise (qdrantCollectionsSchema.ts) — same
// indexing_threshold as MEDIUM_PRESET, five times the segment ceiling.
const LARGE_PRESET = { indexing_threshold: 10000, max_segment_size: 100000 };

function info(overrides: Partial<CollectionIndexInfo>): CollectionIndexInfo {
  return {
    indexingThreshold: null,
    maxSegmentSize: null,
    pointsCount: 0,
    indexedVectorsCount: 0,
    status: 'green',
    ...overrides,
  };
}

describe('planHnswPatch', () => {
  it('skips a collection whose threshold is already at the target and has a built index', () => {
    const plan = planHnswPatch(
      info({
        indexingThreshold: 10000,
        maxSegmentSize: 20000,
        pointsCount: 47584,
        indexedVectorsCount: 47584,
      }),
      MEDIUM_PRESET
    );

    expect(plan).toEqual({
      action: 'skip',
      target: 10000,
      maxSegmentSizeTarget: null,
      reason: 'already indexed',
    });
  });

  it('patches a collection whose threshold sits at or above max_segment_size (the #3119 bug)', () => {
    const plan = planHnswPatch(
      info({
        indexingThreshold: 20000,
        maxSegmentSize: 20000,
        pointsCount: 47584,
        indexedVectorsCount: 0,
      }),
      MEDIUM_PRESET
    );

    expect(plan.action).toBe('patch');
    expect(plan.target).toBe(10000);
    expect(plan.reason).toContain('above the 10000 target');
  });

  it('patches a collection that never had optimizers_config set (null threshold)', () => {
    // Qdrant defaults an unset indexing_threshold to 20000 internally — at or
    // above every preset's max_segment_size, so this must patch too.
    const plan = planHnswPatch(
      info({ indexingThreshold: null, maxSegmentSize: null, pointsCount: 968 }),
      MEDIUM_PRESET
    );

    expect(plan.action).toBe('patch');
    expect(plan.target).toBe(10000);
    expect(plan.reason).toContain('unset');
  });

  it('re-sends the same threshold when it is already fine but indexed_vectors_count is 0', () => {
    // A stalled optimizer ("grey": optimizations pending, awaiting an update
    // operation) resumes on any update-collection call; the value need not
    // change. The plan keeps the live value and says why it patches anyway.
    const plan = planHnswPatch(
      info({
        indexingThreshold: 8000,
        maxSegmentSize: 20000,
        pointsCount: 100,
        indexedVectorsCount: 0,
        status: 'grey',
      }),
      MEDIUM_PRESET
    );

    expect(plan.action).toBe('patch');
    expect(plan.target).toBe(8000);
    expect(plan.reason).toContain('stalled optimizer');
    expect(plan.reason).toContain('grey');
  });

  it('patches when only the segment ceiling differs from the preset', () => {
    // indexing_threshold is already fine and the index is built — only
    // max_segment_size lags the raised `large` preset.
    const plan = planHnswPatch(
      info({
        indexingThreshold: 10000,
        maxSegmentSize: 20000,
        pointsCount: 48119,
        indexedVectorsCount: 45667,
      }),
      LARGE_PRESET
    );

    expect(plan.action).toBe('patch');
    expect(plan.target).toBe(10000);
    expect(plan.maxSegmentSizeTarget).toBe(100000);
    expect(plan.reason).toContain('segment ceiling');
  });

  it('skips when both indexing_threshold and max_segment_size already match the preset', () => {
    const plan = planHnswPatch(
      info({
        indexingThreshold: 10000,
        maxSegmentSize: 100000,
        pointsCount: 48119,
        indexedVectorsCount: 48119,
      }),
      LARGE_PRESET
    );

    expect(plan).toEqual({
      action: 'skip',
      target: 10000,
      maxSegmentSizeTarget: null,
      reason: 'already indexed',
    });
  });

  it('patches both values when the threshold sits at or above a stale ceiling', () => {
    // The #3119 bug shape (threshold === max_segment_size) against a preset
    // whose ceiling has since moved — both dimensions must patch together.
    const plan = planHnswPatch(
      info({
        indexingThreshold: 20000,
        maxSegmentSize: 20000,
        pointsCount: 48119,
        indexedVectorsCount: 0,
      }),
      LARGE_PRESET
    );

    expect(plan.action).toBe('patch');
    expect(plan.target).toBe(10000);
    expect(plan.maxSegmentSizeTarget).toBe(100000);
  });
});

describe('parseCliArgs', () => {
  it('rejects --collection together with --all', () => {
    const parsed = parseCliArgs(['--collection', 'documents', '--all']);
    expect('error' in parsed).toBe(true);
  });

  it('rejects a missing target and an unknown flag', () => {
    expect('error' in parseCliArgs(['--dry-run'])).toBe(true);
    expect('error' in parseCliArgs(['--collection', 'documents', '--verbose'])).toBe(true);
  });

  it('accepts either form on its own', () => {
    expect(parseCliArgs(['--collection', 'documents', '--dry-run'])).toEqual({
      args: { collection: 'documents', all: false, dryRun: true },
    });
    expect(parseCliArgs(['--all'])).toEqual({
      args: { collection: null, all: true, dryRun: false },
    });
  });
});

describe('selectTargets', () => {
  const exists = async (name: string) => name !== 'not_created_yet';

  it('skips schema-declared collections the instance has not created under --all', async () => {
    await expect(selectTargets(['documents', 'not_created_yet'], true, exists)).resolves.toEqual({
      run: ['documents'],
      skipped: ['not_created_yet'],
    });
  });

  it('never skips an explicitly named collection', async () => {
    await expect(selectTargets(['not_created_yet'], false, exists)).resolves.toEqual({
      run: ['not_created_yet'],
      skipped: [],
    });
  });
});

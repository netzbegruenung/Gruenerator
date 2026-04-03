import { describe, it, expect } from 'vitest';

import {
  getKeepRecent,
  getCompactionThreshold,
  getCompactionTokenThreshold,
  needsCompaction,
  KEEP_RECENT,
  COMPACTION_THRESHOLD,
  COMPACTION_TOKEN_THRESHOLD,
} from './compactionService.js';

describe('getKeepRecent', () => {
  it('returns 6 for small context windows (<16K)', () => {
    expect(getKeepRecent(8000)).toBe(6);
    expect(getKeepRecent(15999)).toBe(6);
  });

  it('returns 10 for medium context windows (<32K)', () => {
    expect(getKeepRecent(16000)).toBe(10);
    expect(getKeepRecent(31999)).toBe(10);
  });

  it('returns 15 for large context windows (<64K)', () => {
    expect(getKeepRecent(32000)).toBe(15);
    expect(getKeepRecent(63999)).toBe(15);
  });

  it('returns default (20) for very large context windows', () => {
    expect(getKeepRecent(64000)).toBe(KEEP_RECENT);
    expect(getKeepRecent(128000)).toBe(KEEP_RECENT);
  });

  it('returns default when contextWindowTokens is undefined', () => {
    expect(getKeepRecent(undefined)).toBe(KEEP_RECENT);
    expect(getKeepRecent()).toBe(KEEP_RECENT);
  });
});

describe('getCompactionThreshold', () => {
  it('returns 15 for small context windows', () => {
    expect(getCompactionThreshold(8000)).toBe(15);
  });

  it('returns 25 for medium context windows', () => {
    expect(getCompactionThreshold(16000)).toBe(25);
  });

  it('returns default (50) for large context windows', () => {
    expect(getCompactionThreshold(128000)).toBe(COMPACTION_THRESHOLD);
  });

  it('returns default when undefined', () => {
    expect(getCompactionThreshold()).toBe(COMPACTION_THRESHOLD);
  });
});

describe('getCompactionTokenThreshold', () => {
  it('uses 40% of context window', () => {
    expect(getCompactionTokenThreshold(16000)).toBe(6400);
    expect(getCompactionTokenThreshold(32000)).toBe(12800);
  });

  it('caps at default for large windows', () => {
    expect(getCompactionTokenThreshold(128000)).toBe(COMPACTION_TOKEN_THRESHOLD);
  });

  it('returns default when undefined', () => {
    expect(getCompactionTokenThreshold()).toBe(COMPACTION_TOKEN_THRESHOLD);
  });
});

describe('needsCompaction with contextWindowTokens', () => {
  it('uses model-aware threshold for small context', () => {
    // 16K model (16384 tokens): threshold = 15 messages
    expect(needsCompaction(15, null, undefined, 15000)).toBe(true);
    expect(needsCompaction(14, null, undefined, 15000)).toBe(false);
    // Exactly 16000 falls into <32K bracket: threshold = 25
    expect(needsCompaction(25, null, undefined, 16000)).toBe(true);
    expect(needsCompaction(24, null, undefined, 16000)).toBe(false);
  });

  it('uses model-aware token threshold for small context', () => {
    // 16384 token model: token threshold = floor(16384 * 0.4) = 6553
    expect(needsCompaction(5, null, 6553, 16384)).toBe(true);
    expect(needsCompaction(5, null, 6552, 16384)).toBe(false);
  });

  it('uses default thresholds when contextWindowTokens not provided', () => {
    expect(needsCompaction(50, null)).toBe(true);
    expect(needsCompaction(49, null)).toBe(false);
  });

  it('backward compatible: 128K model uses existing thresholds', () => {
    expect(needsCompaction(50, null, undefined, 128000)).toBe(true);
    expect(needsCompaction(49, null, undefined, 128000)).toBe(false);
  });
});

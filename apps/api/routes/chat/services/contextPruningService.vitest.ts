import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { applyCompaction } from './contextPruningService.js';

// ─── Mock compactionService ────────────────────────────────────────────────

const mockGetMessageCount = vi.fn<() => Promise<number>>();
const mockGetCompactionState = vi.fn<
  () => Promise<{
    summary: string | null;
    compactedUpToMessageId: string | null;
    compactionUpdatedAt: Date | null;
  }>
>();
const mockNeedsCompaction = vi.fn<() => boolean>();
const mockGenerateCompactionSummary = vi.fn<() => Promise<void>>();
const mockGetThreadMessages = vi.fn<() => Promise<any[]>>();
const mockPrepareMessagesWithCompaction = vi.fn();

vi.mock('./compactionService.js', () => ({
  getMessageCount: (...args: any[]) => mockGetMessageCount(...args),
  getCompactionState: (...args: any[]) => mockGetCompactionState(...args),
  needsCompaction: (...args: any[]) => mockNeedsCompaction(...args),
  generateCompactionSummary: (...args: any[]) => mockGenerateCompactionSummary(...args),
  getThreadMessages: (...args: any[]) => mockGetThreadMessages(...args),
  prepareMessagesWithCompaction: (...args: any[]) => mockPrepareMessagesWithCompaction(...args),
}));

vi.mock('./messageHelpers.js', () => ({
  toTokenCounterMessage: (m: any) => m,
  CONTEXT_CONFIG: { MAX_CONTEXT_TOKENS: 4000 },
}));

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────

// Module-level state (compactionInProgress, lastCompactionTime) persists across tests.
// Use unique thread IDs to avoid cross-test interference.
let nextId = 0;
function tid() {
  return `thread-${++nextId}`;
}

function setupMocks(opts: { needsCompaction?: boolean; summary?: string | null } = {}) {
  mockGetMessageCount.mockResolvedValue(100);
  mockGetCompactionState.mockResolvedValue({
    summary: opts.summary ?? null,
    compactedUpToMessageId: null,
    compactionUpdatedAt: null,
  });
  mockNeedsCompaction.mockReturnValue(opts.needsCompaction ?? true);
  mockGenerateCompactionSummary.mockResolvedValue(undefined);
  mockGetThreadMessages.mockResolvedValue([]);
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('applyCompaction – concurrency guard & cooldown', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('triggers compaction when threshold met and no guard active', async () => {
    setupMocks({ needsCompaction: true });
    const id = tid();

    await applyCompaction(id, [], 'system msg');

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger compaction when needsCompaction returns false', async () => {
    setupMocks({ needsCompaction: false });
    const id = tid();

    await applyCompaction(id, [], 'system msg');

    expect(mockGenerateCompactionSummary).not.toHaveBeenCalled();
  });

  it('does NOT trigger concurrent compaction for same thread', async () => {
    const id = tid();

    // Make compaction hang until we resolve it
    let resolveCompaction!: () => void;
    const hangingPromise = new Promise<void>((r) => {
      resolveCompaction = r;
    });

    setupMocks({ needsCompaction: true });
    mockGenerateCompactionSummary.mockReturnValue(hangingPromise);

    // First call — starts compaction (hangs)
    await applyCompaction(id, [], 'system msg');

    // Second call — compaction still in-progress, guard blocks
    await applyCompaction(id, [], 'system msg');

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(1);

    resolveCompaction();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('allows compaction for different threads concurrently', async () => {
    const idA = tid();
    const idB = tid();

    let resolveA!: () => void;
    let resolveB!: () => void;
    const promiseA = new Promise<void>((r) => {
      resolveA = r;
    });
    const promiseB = new Promise<void>((r) => {
      resolveB = r;
    });

    setupMocks({ needsCompaction: true });

    let callCount = 0;
    mockGenerateCompactionSummary.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? promiseA : promiseB;
    });

    await applyCompaction(idA, [], 'system msg');
    await applyCompaction(idB, [], 'system msg');

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(2);

    resolveA();
    resolveB();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('enforces cooldown after successful compaction', async () => {
    setupMocks({ needsCompaction: true });
    const id = tid();

    // First call — triggers compaction
    await applyCompaction(id, [], 'system msg');
    // Flush .then() that sets lastCompactionTime
    await vi.advanceTimersByTimeAsync(0);

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(1);

    // Second call immediately — cooldown blocks
    await applyCompaction(id, [], 'system msg');
    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(1);

    // Advance past cooldown (60s)
    await vi.advanceTimersByTimeAsync(60_001);

    // Third call — cooldown expired, should trigger again
    await applyCompaction(id, [], 'system msg');
    await vi.advanceTimersByTimeAsync(0);

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(2);
  });

  it('returns original systemMessage when no summary exists', async () => {
    setupMocks({ needsCompaction: false, summary: null });
    const id = tid();

    const result = await applyCompaction(id, [], 'my system prompt');

    expect(result).toBe('my system prompt');
  });

  it('returns compacted systemMessage when summary exists', async () => {
    setupMocks({ needsCompaction: false, summary: 'Previous conversation summary...' });
    mockPrepareMessagesWithCompaction.mockReturnValue({
      systemMessage: 'augmented system prompt with summary',
    });
    const id = tid();

    const result = await applyCompaction(id, [], 'my system prompt');

    expect(result).toBe('augmented system prompt with summary');
    expect(mockPrepareMessagesWithCompaction).toHaveBeenCalled();
  });

  it('handles compaction error gracefully and returns original systemMessage', async () => {
    mockGetMessageCount.mockRejectedValue(new Error('DB connection failed'));
    const id = tid();

    const result = await applyCompaction(id, [], 'my system prompt');

    expect(result).toBe('my system prompt');
  });

  it('cleans up in-progress guard even when compaction fails', async () => {
    const id = tid();

    setupMocks({ needsCompaction: true });
    mockGenerateCompactionSummary.mockRejectedValueOnce(new Error('LLM timeout'));

    // First call — triggers compaction which fails
    await applyCompaction(id, [], 'system msg');
    await vi.advanceTimersByTimeAsync(0); // flush .finally()

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(1);

    // Failed compaction does NOT set lastCompactionTime — retry should work immediately
    mockGenerateCompactionSummary.mockResolvedValueOnce(undefined);
    await applyCompaction(id, [], 'system msg');

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(2);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { applyCompaction } from './contextPruningService.js';

// ─── Mock compactionService ────────────────────────────────────────────────
// We mock the entire compactionService to isolate the guard/cooldown logic
// in contextPruningService without hitting the database or LLM.

const mockGetMessageCount = vi.fn<() => Promise<number>>();
const mockGetCompactionState =
  vi.fn<
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

function setupDefaultMocks(
  opts: { messageCount?: number; needsCompaction?: boolean; summary?: string | null } = {}
) {
  mockGetMessageCount.mockResolvedValue(opts.messageCount ?? 100);
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
    setupDefaultMocks({ needsCompaction: true });

    await applyCompaction('thread-1', [], 'system msg');

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(1);
  });

  it('does NOT trigger compaction when needsCompaction returns false', async () => {
    setupDefaultMocks({ needsCompaction: false });

    await applyCompaction('thread-1', [], 'system msg');

    expect(mockGenerateCompactionSummary).not.toHaveBeenCalled();
  });

  it('does NOT trigger concurrent compaction for same thread', async () => {
    // Make generateCompactionSummary hang until we resolve it
    let resolveCompaction!: () => void;
    const compactionPromise = new Promise<void>((resolve) => {
      resolveCompaction = resolve;
    });
    mockGenerateCompactionSummary.mockReturnValue(compactionPromise);
    setupDefaultMocks({ needsCompaction: true });
    // Re-set the mock after setupDefaultMocks since it overrides
    mockGenerateCompactionSummary.mockReturnValue(compactionPromise);

    // First call — starts compaction
    const call1 = applyCompaction('thread-1', [], 'system msg');
    await call1;

    // Second call — should be blocked by in-progress guard
    const call2 = applyCompaction('thread-1', [], 'system msg');
    await call2;

    // Only one compaction should have been triggered
    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(1);

    // Resolve to clean up
    resolveCompaction();
    // Allow microtasks to flush
    await vi.advanceTimersByTimeAsync(0);
  });

  it('allows compaction for different threads concurrently', async () => {
    let resolve1!: () => void;
    let resolve2!: () => void;
    const promise1 = new Promise<void>((r) => {
      resolve1 = r;
    });
    const promise2 = new Promise<void>((r) => {
      resolve2 = r;
    });

    setupDefaultMocks({ needsCompaction: true });

    let callCount = 0;
    mockGenerateCompactionSummary.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? promise1 : promise2;
    });

    await applyCompaction('thread-A', [], 'system msg');
    await applyCompaction('thread-B', [], 'system msg');

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(2);

    resolve1();
    resolve2();
    await vi.advanceTimersByTimeAsync(0);
  });

  it('enforces cooldown after successful compaction', async () => {
    setupDefaultMocks({ needsCompaction: true });

    // First call — triggers compaction
    await applyCompaction('thread-1', [], 'system msg');
    // Flush the .then() that sets lastCompactionTime
    await vi.advanceTimersByTimeAsync(0);

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(1);

    // Second call immediately after — cooldown should block
    await applyCompaction('thread-1', [], 'system msg');

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(1);

    // Advance past cooldown (60s)
    await vi.advanceTimersByTimeAsync(60_001);

    // Third call — cooldown expired, should trigger again
    await applyCompaction('thread-1', [], 'system msg');
    await vi.advanceTimersByTimeAsync(0);

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(2);
  });

  it('returns original systemMessage when no summary exists', async () => {
    setupDefaultMocks({ needsCompaction: false, summary: null });

    const result = await applyCompaction('thread-1', [], 'my system prompt');

    expect(result).toBe('my system prompt');
  });

  it('returns compacted systemMessage when summary exists', async () => {
    setupDefaultMocks({ needsCompaction: false, summary: 'Previous conversation summary...' });
    mockPrepareMessagesWithCompaction.mockReturnValue({
      systemMessage: 'augmented system prompt with summary',
    });

    const result = await applyCompaction('thread-1', [], 'my system prompt');

    expect(result).toBe('augmented system prompt with summary');
    expect(mockPrepareMessagesWithCompaction).toHaveBeenCalled();
  });

  it('handles compaction error gracefully and returns original systemMessage', async () => {
    mockGetMessageCount.mockRejectedValue(new Error('DB connection failed'));

    const result = await applyCompaction('thread-1', [], 'my system prompt');

    expect(result).toBe('my system prompt');
  });

  it('cleans up in-progress guard even when compaction fails', async () => {
    setupDefaultMocks({ needsCompaction: true });
    mockGenerateCompactionSummary.mockRejectedValue(new Error('LLM timeout'));

    // First call — triggers compaction which fails
    await applyCompaction('thread-1', [], 'system msg');
    await vi.advanceTimersByTimeAsync(0); // flush .finally()

    // Advance past cooldown — failed compaction should NOT set lastCompactionTime
    await vi.advanceTimersByTimeAsync(60_001);

    // Second call — guard should be cleared, allowing retry
    mockGenerateCompactionSummary.mockResolvedValue(undefined);
    await applyCompaction('thread-1', [], 'system msg');

    expect(mockGenerateCompactionSummary).toHaveBeenCalledTimes(2);
  });
});

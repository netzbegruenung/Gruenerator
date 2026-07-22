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

// ─── pruneMessages: suffix-window behavior (long-thread mechanism) ─────────

describe('pruneMessages – suffix window', () => {
  // Documents the load-bearing (and risky) current behavior: pruning keeps a
  // recent-message suffix only. A scope-establishing first turn (mention token,
  // created artifact) is silently dropped once the window slides past it. If a
  // pinning mechanism is ever added, these expectations must change.
  const big = (role: 'user' | 'assistant', chars: number, tag: string) => ({
    role,
    content: `${tag} ${'x'.repeat(chars)}`,
  });

  it('keeps all messages when under budget', async () => {
    const { pruneMessages } = await import('./contextPruningService.js');
    const msgs = [big('user', 100, 'm0'), big('assistant', 100, 'm1'), big('user', 100, 'm2')];
    expect(pruneMessages(msgs as any)).toHaveLength(3);
  });

  it('drops the oldest (scope-establishing) messages first when over budget', async () => {
    const { pruneMessages } = await import('./contextPruningService.js');
    // Mocked MAX_CONTEXT_TOKENS=4000, response reserve 1000 → ~3000 available.
    // Each message ≈ 4000/4 + 10 = 1010 tokens → only the last 2 survive.
    const msgs = [
      big('user', 4000, 'scope-establishing-mention'),
      big('assistant', 4000, 'm1'),
      big('user', 4000, 'm2'),
      big('assistant', 4000, 'm3'),
      big('user', 4000, 'probe'),
    ];
    const pruned = pruneMessages(msgs as any);
    expect(pruned).toHaveLength(2);
    expect(String(pruned[0].content)).toContain('m3');
    expect(String(pruned[1].content)).toContain('probe');
    // The turn that established scope is gone — the exact long-thread hazard.
    expect(pruned.some((m) => String(m.content).includes('scope-establishing'))).toBe(false);
  });
});

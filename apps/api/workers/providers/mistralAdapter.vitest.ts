/**
 * Mistral adapter — retry delegation.
 *
 * The adapter used to carry its own retry loop with exponential backoff and a
 * substring-matched retryability check. That is the SDK's job; these tests pin
 * that the delegation actually happens and keeps the same attempt budget.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateText = vi.fn();

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateText(...args),
}));
vi.mock('../../services/ai/providers.js', () => ({
  getModel: vi.fn(() => ({ modelId: 'mistral-medium-2604' })),
  isProviderConfigured: vi.fn(() => true),
}));
vi.mock('../../services/tools/index.js', () => ({
  default: { prepareToolsPayload: vi.fn(() => ({})) },
}));

const { execute, connectionMetrics } = await import('./mistralAdapter.js');

function request() {
  return {
    type: 'chat',
    messages: [{ role: 'user' as const, content: 'Hallo' }],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  connectionMetrics.attempts = 0;
  connectionMetrics.successes = 0;
  connectionMetrics.failures = 0;
  connectionMetrics.lastFailureTime = null;
  connectionMetrics.lastFailureReason = null;
});

describe('mistralAdapter — retry delegation', () => {
  it('asks the SDK for 2 retries, i.e. the same 3 attempts as the old loop', async () => {
    generateText.mockResolvedValue({ text: 'Antwort', finishReason: 'stop' });

    await execute('req-1', request() as never);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0][0]).toMatchObject({ maxRetries: 2 });
  });

  it('does not retry in the adapter itself', async () => {
    // A network-shaped error used to trigger the adapter's own loop. It must now
    // surface after a single adapter-level call — the SDK already retried inside.
    generateText.mockRejectedValue(new Error('fetch failed'));

    await expect(execute('req-2', request() as never)).rejects.toThrow('fetch failed');
    expect(generateText).toHaveBeenCalledTimes(1);
  });

  it('records the failure reason for the metrics log', async () => {
    generateText.mockRejectedValue(new Error('ECONNRESET'));

    await expect(execute('req-3', request() as never)).rejects.toThrow();
    expect(connectionMetrics.failures).toBe(1);
    expect(connectionMetrics.lastFailureReason).toBe('ECONNRESET');
    expect(connectionMetrics.lastFailureTime).not.toBeNull();
  });

  it('counts a success once', async () => {
    generateText.mockResolvedValue({ text: 'ok', finishReason: 'stop' });

    await execute('req-4', request() as never);

    expect(connectionMetrics.attempts).toBe(1);
    expect(connectionMetrics.successes).toBe(1);
    expect(connectionMetrics.failures).toBe(0);
  });
});

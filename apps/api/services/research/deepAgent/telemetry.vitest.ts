import { describe, expect, it, vi } from 'vitest';

const withLangfuseTrace = vi.fn((_opts: unknown, fn: () => Promise<unknown>) => fn());
vi.mock('../../telemetry/langfuseTelemetry.js', () => ({
  withLangfuseTrace: (opts: unknown, fn: () => Promise<unknown>) => withLangfuseTrace(opts, fn),
}));

const { RESEARCH_TRACE_TAG, withResearchTrace } = await import('./telemetry.js');

describe('withResearchTrace', () => {
  it('tags every run so the traces can be filtered apart', async () => {
    await withResearchTrace({ threadId: 'r1' }, async () => 'x');
    expect(withLangfuseTrace.mock.calls[0]?.[0]).toMatchObject({
      name: 'deep-research',
      tags: [RESEARCH_TRACE_TAG],
      metadata: { threadId: 'r1' },
    });
  });

  it('attributes the trace when the caller knows whose run it is', async () => {
    await withResearchTrace({ threadId: 'r1', userId: 'u1' }, async () => 'x');
    expect(withLangfuseTrace.mock.calls.at(-1)?.[0]).toMatchObject({ userId: 'u1' });
  });

  it('leaves the field out rather than sending an empty user', async () => {
    await withResearchTrace({ threadId: 'r1' }, async () => 'x');
    expect(withLangfuseTrace.mock.calls.at(-1)?.[0]).not.toHaveProperty('userId');
  });

  it('returns what the run returns', async () => {
    await expect(withResearchTrace({ threadId: 'r1' }, async () => 42)).resolves.toBe(42);
  });
});

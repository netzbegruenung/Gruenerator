import { beforeEach, describe, expect, it, vi } from 'vitest';

const isLangfuseEnabled = vi.fn<() => boolean>();
const handlerParams: unknown[] = [];

vi.mock('../../telemetry/langfuseTelemetry.js', () => ({
  isLangfuseEnabled: () => isLangfuseEnabled(),
}));
vi.mock('@langfuse/langchain', () => ({
  CallbackHandler: class {
    constructor(params: unknown) {
      handlerParams.push(params);
    }
  },
}));

const { RESEARCH_TRACE_TAG, researchCallbacks } = await import('./telemetry.js');

beforeEach(() => {
  vi.clearAllMocks();
  handlerParams.length = 0;
});

describe('researchCallbacks', () => {
  /**
   * The kill switch. Unsetting the Langfuse env vars leaves the provider
   * unregistered, and from there nothing may be constructed — a handler without
   * a provider would emit through the GLOBAL tracer, which Sentry installs with
   * a rate-0 sampler in production. That failure is silent, so it is checked
   * here rather than trusted.
   */
  it('builds nothing when Langfuse is not configured', () => {
    isLangfuseEnabled.mockReturnValue(false);

    expect(researchCallbacks()).toEqual([]);
    expect(handlerParams).toEqual([]);
  });

  it('tags every run so the traces can be filtered apart', () => {
    isLangfuseEnabled.mockReturnValue(true);

    const callbacks = researchCallbacks();

    expect(callbacks).toHaveLength(1);
    expect(handlerParams[0]).toEqual({ tags: [RESEARCH_TRACE_TAG] });
  });

  it('attributes the trace when the caller knows whose run it is', () => {
    isLangfuseEnabled.mockReturnValue(true);

    researchCallbacks({ userId: 'user-1' });

    expect(handlerParams[0]).toEqual({ tags: [RESEARCH_TRACE_TAG], userId: 'user-1' });
  });

  it('leaves the field out rather than sending an empty user', () => {
    // `exactOptionalPropertyTypes` aside, an empty string would show up as a
    // real user id in the Langfuse filter and quietly group unrelated runs.
    isLangfuseEnabled.mockReturnValue(true);

    researchCallbacks({ userId: '' });

    expect(handlerParams[0]).toEqual({ tags: [RESEARCH_TRACE_TAG] });
  });
});

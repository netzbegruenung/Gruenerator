import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AIRequestData, AIWorkerResult } from '../../../workers/types.js';

const mockExecuteProvider = vi.fn();
const mockSelectProviderAndModel = vi.fn();
const mockTryFallbackProviders = vi.fn();
const mockTrySharepicFallbackProviders = vi.fn();

vi.mock('../../../workers/providers/index.js', () => ({
  executeProvider: (...args: unknown[]) => mockExecuteProvider(...args),
}));

vi.mock('../../providers/providerSelector.js', () => ({
  selectProviderAndModel: (...args: unknown[]) => mockSelectProviderAndModel(...args),
}));

vi.mock('../../providers/providerFallback.js', () => ({
  tryFallbackProviders: (...args: unknown[]) => mockTryFallbackProviders(...args),
  trySharepicFallbackProviders: (...args: unknown[]) => mockTrySharepicFallbackProviders(...args),
}));

// The timeout used to come from `workers/worker.config.ts`, which wrapped this
// same env value in ~18 settings nothing read. It is now read straight from env.
vi.mock('../../../config/env.js', () => ({
  env: { REQUEST_TIMEOUT: 5000 },
}));

import { AIService } from '../aiService.js';
import { AiProviderError } from '../../providers/providerErrors.js';

const VALID_RESULT: AIWorkerResult = {
  content: 'Generated text',
  stop_reason: 'end_turn',
  success: true,
  metadata: {
    provider: 'mistral',
    timestamp: new Date().toISOString(),
  },
};

const TOOL_USE_RESULT: AIWorkerResult = {
  content: null,
  stop_reason: 'tool_use',
  tool_calls: [{ id: 'call_1', name: 'search', input: { query: 'test' } }],
  success: true,
  metadata: {
    provider: 'mistral',
    timestamp: new Date().toISOString(),
  },
};

function makeRequest(overrides: Partial<AIRequestData> = {}): AIRequestData {
  return {
    type: 'text_generation',
    prompt: 'Write something',
    ...overrides,
  };
}

describe('AIService', () => {
  let service: AIService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectProviderAndModel.mockReturnValue({
      provider: 'litellm',
      model: 'verdigado-pro',
    });
    mockExecuteProvider.mockResolvedValue(VALID_RESULT);
    service = new AIService();
  });

  it('returns AIWorkerResult with correct shape', async () => {
    const result = await service.processRequest(makeRequest());

    expect(result.content).toBe('Generated text');
    expect(result.stop_reason).toBe('end_turn');
    expect(result.success).toBe(true);
  });

  it('includes requestId and processedAt in metadata', async () => {
    const result = await service.processRequest(makeRequest());

    expect(result.metadata?.requestId).toMatch(/^req_/);
    expect(result.metadata?.processedAt).toBeDefined();
  });

  it('calls providerSelector with correct args', async () => {
    const data = makeRequest({ type: 'sharepic_zitat', options: { temperature: 0.5 } });
    await service.processRequest(data);

    expect(mockSelectProviderAndModel).toHaveBeenCalledWith({
      type: 'sharepic_zitat',
      options: { temperature: 0.5 },
      metadata: {},
      env: process.env,
    });
  });

  it('uses explicit provider when specified', async () => {
    const data = makeRequest({ provider: 'regolo' });
    await service.processRequest(data);

    expect(mockExecuteProvider).toHaveBeenCalledWith(
      'regolo',
      expect.stringMatching(/^req_/),
      expect.objectContaining({ provider: 'regolo' })
    );
  });

  it('triggers fallback on empty response', async () => {
    mockExecuteProvider.mockResolvedValue({ content: null, success: false });
    mockTryFallbackProviders.mockResolvedValue(VALID_RESULT);

    const result = await service.processRequest(makeRequest());

    expect(mockTryFallbackProviders).toHaveBeenCalled();
    expect(result.content).toBe('Generated text');
  });

  it('triggers fallback on error', async () => {
    mockExecuteProvider.mockRejectedValue(new Error('Provider down'));
    mockTryFallbackProviders.mockResolvedValue(VALID_RESULT);

    const result = await service.processRequest(makeRequest());

    expect(mockTryFallbackProviders).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('uses sharepic fallback for sharepic types', async () => {
    mockExecuteProvider.mockResolvedValue({ content: null, success: false });
    mockTrySharepicFallbackProviders.mockResolvedValue(VALID_RESULT);

    const data = makeRequest({ type: 'sharepic_dreizeilen' });
    await service.processRequest(data);

    expect(mockTrySharepicFallbackProviders).toHaveBeenCalled();
    expect(mockTryFallbackProviders).not.toHaveBeenCalled();
  });

  it('uses privacy fallback for non-sharepic types', async () => {
    mockExecuteProvider.mockResolvedValue({ content: null, success: false });
    mockTryFallbackProviders.mockResolvedValue(VALID_RESULT);

    const data = makeRequest({ type: 'text_generation' });
    await service.processRequest(data);

    expect(mockTryFallbackProviders).toHaveBeenCalled();
    expect(mockTrySharepicFallbackProviders).not.toHaveBeenCalled();
  });

  it('accepts tool_use result with tool_calls', async () => {
    mockExecuteProvider.mockResolvedValue(TOOL_USE_RESULT);

    const result = await service.processRequest(makeRequest());

    expect(result.stop_reason).toBe('tool_use');
    expect(result.tool_calls).toHaveLength(1);
  });

  it('throws when tool_use but no tool_calls', async () => {
    mockExecuteProvider.mockResolvedValue({
      content: null,
      stop_reason: 'tool_use',
      tool_calls: [],
      success: true,
      metadata: { provider: 'mistral', timestamp: new Date().toISOString() },
    });
    mockTryFallbackProviders.mockRejectedValue(new Error('All fallbacks failed'));

    await expect(service.processRequest(makeRequest())).rejects.toThrow(
      'Tool use indicated but no tool calls found'
    );
  });

  it('shutdown resolves without error', async () => {
    await expect(service.shutdown()).resolves.toBeUndefined();
  });

  it('throws on timeout', async () => {
    vi.useFakeTimers();
    try {
      mockExecuteProvider.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(VALID_RESULT), 10000))
      );

      const promise = service.processRequest(makeRequest());
      // Catch immediately to prevent unhandled rejection
      const resultPromise = promise.catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(5000);

      const error = await resultPromise;
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Request timeout after 5000ms');
      // A timeout is retryable and is NOT an internal error — the SSE layer
      // shows the user something actionable only if it can tell the two apart.
      expect(error).toBeInstanceOf(AiProviderError);
      expect((error as AiProviderError).code).toBe('timeout');
      expect((error as AiProviderError).retryable).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * `AiProviderError` used to be built in exactly one place: the `worker_threads`
 * pool, rebuilding it from the classification the worker had posted alongside
 * the message. When the pool went, so did every construction site — and the
 * taxonomy `sseHelpers` branches on (`rate_limited` / `provider_unavailable` /
 * `invalid_request`, each with `retryable`) has been dead since, with every
 * provider failure reaching the client as a bare `internal`.
 *
 * These assert the classification survives the two routes out of the service.
 */
describe('AIService — provider errors reach the caller classified', () => {
  let service: AIService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AIService();
    mockSelectProviderAndModel.mockReturnValue({ provider: 'mistral', model: 'mistral-medium' });
  });

  it('keeps a rate limit a rate limit', async () => {
    const rateLimited = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
    mockExecuteProvider.mockRejectedValue(rateLimited);
    mockTryFallbackProviders.mockRejectedValue(new Error('All fallbacks failed'));

    const error = await service.processRequest(makeRequest()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).code).toBe('rate_limited');
    expect((error as AiProviderError).retryable).toBe(true);
    expect((error as AiProviderError).statusCode).toBe(429);
  });

  it('reads the status through the fallback aggregate, which used to swallow it', async () => {
    // The aggregate is what the caller actually sees whenever the FIRST attempt
    // returns empty content: the empty result sends us into the fallback chain,
    // and the chain's own failure becomes the error. It interpolated the last
    // provider error into a string, so a 503 arrived as prose.
    mockExecuteProvider.mockResolvedValue({ content: null, success: true });
    const unavailable = Object.assign(new Error('Bad Gateway'), { statusCode: 503 });
    mockTryFallbackProviders.mockRejectedValue(
      new Error('All fallback providers failed (tried: litellm). Last error: Bad Gateway', {
        cause: unavailable,
      })
    );

    const error = await service.processRequest(makeRequest()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiProviderError);
    expect((error as AiProviderError).code).toBe('provider_unavailable');
    expect((error as AiProviderError).retryable).toBe(true);
  });

  it('does not dress a bad request up as retryable', async () => {
    const badRequest = Object.assign(new Error('Unknown model'), { statusCode: 400 });
    mockExecuteProvider.mockRejectedValue(badRequest);
    mockTryFallbackProviders.mockRejectedValue(new Error('All fallbacks failed'));

    const error = await service.processRequest(makeRequest()).catch((e: unknown) => e);

    expect((error as AiProviderError).code).toBe('invalid_request');
    expect((error as AiProviderError).retryable).toBe(false);
  });

  it('preserves the original error as `cause` for logging', async () => {
    const original = Object.assign(new Error('Too Many Requests'), { statusCode: 429 });
    mockExecuteProvider.mockRejectedValue(original);
    mockTryFallbackProviders.mockRejectedValue(new Error('All fallbacks failed'));

    const error = await service.processRequest(makeRequest()).catch((e: unknown) => e);

    expect((error as Error).cause).toBe(original);
  });
});

/**
 * The routing chain used to name litellm and regolo explicitly and send
 * everything else to mistral. A `greenpt` selection therefore answered on
 * mistral without a word — latent rather than live (no call site selects
 * greenpt today), but the shape of the defect is that EVERY future provider
 * inherits it.
 */
describe('AIService — the selected provider is the one that runs', () => {
  let service: AIService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AIService();
    mockExecuteProvider.mockResolvedValue(VALID_RESULT);
  });

  for (const provider of ['mistral', 'litellm', 'regolo', 'greenpt'] as const) {
    it(`runs ${provider} when ${provider} is selected`, async () => {
      mockSelectProviderAndModel.mockReturnValue({ provider, model: 'some-model' });

      await service.processRequest(makeRequest());

      expect(mockExecuteProvider).toHaveBeenCalledWith(
        provider,
        expect.any(String),
        expect.any(Object)
      );
    });
  }

  it('a top-level provider still overrides the selection', async () => {
    mockSelectProviderAndModel.mockReturnValue({ provider: 'litellm', model: 'verdigado-pro' });

    await service.processRequest(makeRequest({ provider: 'mistral' }));

    expect(mockExecuteProvider).toHaveBeenCalledWith(
      'mistral',
      expect.any(String),
      expect.any(Object)
    );
  });
});

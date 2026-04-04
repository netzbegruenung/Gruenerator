import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AIRequestData, AIWorkerResult } from '../../../workers/types.js';

const mockExecuteProvider = vi.fn();
const mockSelectProviderAndModel = vi.fn();
const mockTryPrivacyModeProviders = vi.fn();
const mockTrySharepicFallbackProviders = vi.fn();
const mockGetProviderForUser = vi.fn();

vi.mock('../../../workers/providers/index.js', () => ({
  executeProvider: (...args: unknown[]) => mockExecuteProvider(...args),
}));

vi.mock('../../providers/providerSelector.js', () => ({
  selectProviderAndModel: (...args: unknown[]) => mockSelectProviderAndModel(...args),
}));

vi.mock('../../providers/providerFallback.js', () => ({
  tryPrivacyModeProviders: (...args: unknown[]) => mockTryPrivacyModeProviders(...args),
  trySharepicFallbackProviders: (...args: unknown[]) => mockTrySharepicFallbackProviders(...args),
}));

vi.mock('../../../workers/worker.config.js', () => ({
  default: { worker: { requestTimeout: 5000 } },
}));

vi.mock('../../counters/index.js', () => ({
  PrivacyCounter: class MockPrivacyCounter {
    getProviderForUser = mockGetProviderForUser;
  },
}));

import { AIService } from '../aiService.js';

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
      model: 'gpt-oss:120b',
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
    const data = makeRequest({ provider: 'ionos' });
    await service.processRequest(data);

    expect(mockExecuteProvider).toHaveBeenCalledWith(
      'ionos',
      expect.stringMatching(/^req_/),
      expect.objectContaining({ provider: 'ionos' })
    );
  });

  it('routes ultra mode to IONOS', async () => {
    const data = makeRequest({ options: { useUltraMode: true } });
    await service.processRequest(data);

    expect(mockExecuteProvider).toHaveBeenCalledWith(
      'ionos',
      expect.any(String),
      expect.objectContaining({
        options: expect.objectContaining({ model: 'openai/gpt-oss-120b' }),
      })
    );
  });

  it('routes pro mode to Mistral', async () => {
    mockSelectProviderAndModel.mockReturnValue({
      provider: 'mistral',
      model: 'magistral-medium-latest',
    });
    const data = makeRequest({ options: { useProMode: true } });
    await service.processRequest(data);

    expect(mockExecuteProvider).toHaveBeenCalledWith(
      'mistral',
      expect.any(String),
      expect.objectContaining({
        options: expect.objectContaining({ useProMode: true }),
      })
    );
  });

  it('resolves privacy provider when usePrivacyMode + userId', async () => {
    mockGetProviderForUser.mockResolvedValue('regolo');
    const mockRedisClient = {} as any;
    const privacyService = new AIService(mockRedisClient);

    const data = makeRequest({ usePrivacyMode: true });
    await privacyService.processRequest(data, { user: { id: 'user-123' } });

    expect(mockGetProviderForUser).toHaveBeenCalledWith('user-123');
    expect(mockExecuteProvider).toHaveBeenCalledWith(
      'regolo',
      expect.any(String),
      expect.objectContaining({ provider: 'regolo' })
    );
  });

  it('falls back to default provider when privacy mode but no userId', async () => {
    const mockRedisClient = {} as any;
    const privacyService = new AIService(mockRedisClient);

    const data = makeRequest({ usePrivacyMode: true });
    await privacyService.processRequest(data, { user: {} });

    expect(mockGetProviderForUser).not.toHaveBeenCalled();
  });

  it('triggers fallback on empty response', async () => {
    mockExecuteProvider.mockResolvedValue({ content: null, success: false });
    mockTryPrivacyModeProviders.mockResolvedValue(VALID_RESULT);

    const result = await service.processRequest(makeRequest());

    expect(mockTryPrivacyModeProviders).toHaveBeenCalled();
    expect(result.content).toBe('Generated text');
  });

  it('triggers fallback on error', async () => {
    mockExecuteProvider.mockRejectedValue(new Error('Provider down'));
    mockTryPrivacyModeProviders.mockResolvedValue(VALID_RESULT);

    const result = await service.processRequest(makeRequest());

    expect(mockTryPrivacyModeProviders).toHaveBeenCalled();
    expect(result.success).toBe(true);
  });

  it('uses sharepic fallback for sharepic types', async () => {
    mockExecuteProvider.mockResolvedValue({ content: null, success: false });
    mockTrySharepicFallbackProviders.mockResolvedValue(VALID_RESULT);

    const data = makeRequest({ type: 'sharepic_dreizeilen' });
    await service.processRequest(data);

    expect(mockTrySharepicFallbackProviders).toHaveBeenCalled();
    expect(mockTryPrivacyModeProviders).not.toHaveBeenCalled();
  });

  it('uses privacy fallback for non-sharepic types', async () => {
    mockExecuteProvider.mockResolvedValue({ content: null, success: false });
    mockTryPrivacyModeProviders.mockResolvedValue(VALID_RESULT);

    const data = makeRequest({ type: 'text_generation' });
    await service.processRequest(data);

    expect(mockTryPrivacyModeProviders).toHaveBeenCalled();
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
    mockTryPrivacyModeProviders.mockRejectedValue(new Error('All fallbacks failed'));

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
    } finally {
      vi.useRealTimers();
    }
  });
});

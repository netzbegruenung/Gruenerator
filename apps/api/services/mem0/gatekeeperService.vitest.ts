import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGenerateObject = vi.fn();
vi.mock('ai', () => ({ generateObject: mockGenerateObject }));

const mockGetIntermediateModel = vi.fn(() => ({ id: 'mock-model' }));
vi.mock('../ai/providers.js', () => ({ getIntermediateModel: mockGetIntermediateModel }));

const mockSearchMemories = vi.fn();
const mockGetMem0Instance = vi.fn(() => ({ searchMemories: mockSearchMemories }));
vi.mock('./Mem0Service.js', () => ({ getMem0Instance: mockGetMem0Instance }));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { shouldExtractMemories } = await import('./gatekeeperService.js');

function skipDecision(reasoning = 'nicht relevant') {
  return { shouldExtract: false, confidence: 'low' as const, reasoning };
}

function extractDecision(confidence: 'high' | 'medium' | 'low', reasoning = 'relevant') {
  return { shouldExtract: true, confidence, reasoning };
}

function gatekeeperResult(overrides: Record<string, ReturnType<typeof skipDecision>>) {
  return {
    identity: skipDecision(),
    activity: skipDecision(),
    context: skipDecision(),
    experience: skipDecision(),
    preference: skipDecision(),
    ...overrides,
  };
}

describe('shouldExtractMemories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMem0Instance.mockReturnValue({ searchMemories: mockSearchMemories });
  });

  it('returns shouldExtract=false when no category clears the low-confidence filter', async () => {
    mockSearchMemories.mockResolvedValue([]);
    mockGenerateObject.mockResolvedValue({ object: gatekeeperResult({}) });

    const decision = await shouldExtractMemories('hi', 'hallo', 'user-1');

    expect(decision.shouldExtract).toBe(false);
    expect(decision.categories).toEqual([]);
    expect(decision.confidence).toBeNull();
  });

  it('drops low-confidence categories even when shouldExtract is true', async () => {
    mockSearchMemories.mockResolvedValue([]);
    mockGenerateObject.mockResolvedValue({
      object: gatekeeperResult({ identity: extractDecision('low') }),
    });

    const decision = await shouldExtractMemories('hi', 'hallo', 'user-1');

    expect(decision.shouldExtract).toBe(false);
    expect(decision.categories).toEqual([]);
  });

  it('picks the highest confidence among surviving categories', async () => {
    mockSearchMemories.mockResolvedValue([]);
    mockGenerateObject.mockResolvedValue({
      object: gatekeeperResult({
        identity: extractDecision('medium'),
        preference: extractDecision('high'),
      }),
    });

    const decision = await shouldExtractMemories('hi', 'hallo', 'user-1');

    expect(decision.shouldExtract).toBe(true);
    expect(decision.categories.sort()).toEqual(['identity', 'preference']);
    expect(decision.confidence).toBe('high');
  });

  it('returns null existing-memories context when the search finds nothing', async () => {
    mockSearchMemories.mockResolvedValue([]);
    mockGenerateObject.mockResolvedValue({ object: gatekeeperResult({}) });

    await shouldExtractMemories('hi', 'hallo', 'user-1');

    const prompt = mockGenerateObject.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain('Bereits gespeicherte Erinnerungen');
  });

  it('truncates existing memories longer than 160 chars in the dedup context', async () => {
    const longMemory = 'x'.repeat(200);
    mockSearchMemories.mockResolvedValue([{ id: '1', memory: longMemory, metadata: {} }]);
    mockGenerateObject.mockResolvedValue({ object: gatekeeperResult({}) });

    await shouldExtractMemories('hi', 'hallo', 'user-1');

    const prompt = mockGenerateObject.mock.calls[0][0].prompt as string;
    expect(prompt).toContain('Bereits gespeicherte Erinnerungen');
    expect(prompt).toContain(`${'x'.repeat(160)}…`);
    expect(prompt).not.toContain('x'.repeat(161));
  });

  it('fails closed (skip extraction) when generateObject rejects', async () => {
    mockSearchMemories.mockResolvedValue([]);
    mockGenerateObject.mockRejectedValue(new Error('structured output failed'));

    const decision = await shouldExtractMemories('hi', 'hallo', 'user-1');

    expect(decision.shouldExtract).toBe(false);
    expect(decision.categories).toEqual([]);
    expect(decision.confidence).toBeNull();
  });

  it('fails open on the dedup pre-check (still runs extraction) when searchMemories rejects', async () => {
    mockSearchMemories.mockRejectedValue(new Error('vector store unreachable'));
    mockGenerateObject.mockResolvedValue({
      object: gatekeeperResult({ identity: extractDecision('high') }),
    });

    const decision = await shouldExtractMemories('hi', 'hallo', 'user-1');

    expect(decision.shouldExtract).toBe(true);
    expect(decision.categories).toEqual(['identity']);
  });

  it('skips the dedup pre-check entirely when there is no mem0 instance', async () => {
    mockGetMem0Instance.mockReturnValue(null);
    mockGenerateObject.mockResolvedValue({ object: gatekeeperResult({}) });

    await shouldExtractMemories('hi', 'hallo', 'user-1');

    expect(mockSearchMemories).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { _resetModelHealthForTests, modelHealthSnapshot } from '../ai/modelHealth.js';

import { withUsageTracking } from './usageModelMiddleware.js';

import type { LanguageModel } from 'ai';

const recordTokenUsage = vi.fn();
vi.mock('./UsageTrackingService.js', () => ({
  recordTokenUsage: (...args: unknown[]) => recordTokenUsage(...args),
}));

let currentUser: string | null = null;
vi.mock('../../utils/usageContext.js', () => ({
  getUsageUserId: () => currentUser,
  getUsageFeature: () => 'test',
}));

/** Ein Modell-Double auf Spezifikationsebene — das sieht die Middleware. */
function fakeModel(parts: unknown[], outputTokens: number): LanguageModel {
  return {
    specificationVersion: 'v3',
    provider: 'fake',
    modelId: 'fake-model',
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'ok' }],
      usage: { inputTokens: 10, outputTokens },
      finishReason: 'stop',
      warnings: [],
    }),
    doStream: async () => ({
      stream: new ReadableStream({
        start(controller) {
          for (const part of parts) controller.enqueue(part);
          controller.enqueue({ type: 'finish', usage: { inputTokens: 10, outputTokens } });
          controller.close();
        },
      }),
    }),
  } as unknown as LanguageModel;
}

async function drain(model: LanguageModel): Promise<void> {
  const wrapped = model as unknown as {
    doStream: () => Promise<{ stream: ReadableStream<unknown> }>;
  };
  const { stream } = await wrapped.doStream();
  const reader = stream.getReader();
  while (!(await reader.read()).done) {
    /* leer trinken */
  }
}

describe('withUsageTracking', () => {
  beforeEach(() => {
    _resetModelHealthForTests();
    recordTokenUsage.mockClear();
    currentUser = 'u1';
  });

  it('misst den Durchsatz eines blockierenden Aufrufs', async () => {
    const model = withUsageTracking(fakeModel([], 200), 'regolo');
    await (model as unknown as { doGenerate: () => Promise<unknown> }).doGenerate();

    const [row] = modelHealthSnapshot();
    expect(row?.provider).toBe('regolo');
    expect(row?.model).toBe('fake-model');
    expect(row?.samples).toBe(1);
  });

  it('misst die Zeit bis zum ersten Text-Token beim Streamen', async () => {
    const parts = [
      { type: 'reasoning-delta', delta: '…' },
      { type: 'text-delta', text: 'Hallo' },
    ];
    await drain(withUsageTracking(fakeModel(parts, 200), 'regolo'));

    const [row] = modelHealthSnapshot();
    expect(row?.p50TtftMs).not.toBeNull();
  });

  it('misst auch ohne angemeldeten Nutzer — gebucht wird dann nicht', async () => {
    currentUser = null;
    await drain(withUsageTracking(fakeModel([{ type: 'text-delta', text: 'x' }], 200), 'regolo'));

    expect(modelHealthSnapshot()[0]?.samples).toBe(1);
    expect(recordTokenUsage).not.toHaveBeenCalled();
  });

  it('bucht weiterhin, wenn ein Nutzer da ist', async () => {
    await drain(withUsageTracking(fakeModel([{ type: 'text-delta', text: 'x' }], 200), 'regolo'));
    expect(recordTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'regolo', outputTokens: 200 })
    );
  });
});

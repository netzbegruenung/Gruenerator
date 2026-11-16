/**
 * Which model answers a streamed text generation is decided by the route type,
 * never by the request body. `provider`, `model` and `reasoningEffort` are not
 * part of any client's payload; a body that carries them must be answered
 * exactly like one that does not.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request, Response } from 'express';

const mockStreamText = vi.fn();
vi.mock('ai', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  streamText: (...args: unknown[]): unknown => mockStreamText(...args),
}));

const mockGetModel = vi.fn();
vi.mock('../../services/ai/providers.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getModel: (provider: string, model?: string): unknown => {
    mockGetModel(provider, model);
    return { provider, model };
  },
}));

const sent: string[] = [];
vi.mock('../../routes/chat/services/sseHelpers.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createSSEStream: () => ({
    send: (event: string) => sent.push(event),
    sendRaw: (event: string) => sent.push(event),
    isEnded: () => false,
    end: vi.fn(),
  }),
}));

vi.mock('../../utils/requestEnrichment.js', () => ({
  enrichRequest: async () => ({ documents: [], enrichmentMetadata: {} }),
}));
vi.mock('./promptAssemblyGraph.js', () => ({
  assemblePromptGraphAsync: async () => ({
    system: 'system',
    messages: [{ role: 'user', content: 'request' }],
  }),
}));
vi.mock('./PRAgent/index.js', () => ({ processAutomatischPR: vi.fn() }));
vi.mock('./PromptProcessor.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  applyProfileDefaults: async () => {},
}));
vi.mock('../../database/services/GenerationStatsService/index.js', () => ({
  getGenerationStatsService: () => ({ logGeneration: async () => {} }),
}));

const { processGraphRequestStreaming } = await import('./streamingProcessor.js');

const ROUTE_TYPES = ['universal', 'custom_prompt', 'social', 'antrag_simple'] as const;

function baseBody(routeType: (typeof ROUTE_TYPES)[number]): Record<string, unknown> {
  return {
    customPrompt: 'Schreibe einen kurzen Text über Radwege.',
    ...(routeType === 'social' && { thema: 'Radwege', platforms: ['instagram'] }),
  };
}

interface Answered {
  getModelCalls: unknown[][];
  maxOutputTokens: unknown;
  providerOptions: unknown;
}

async function answer(routeType: string, body: Record<string, unknown>): Promise<Answered> {
  mockGetModel.mockClear();
  mockStreamText.mockClear();
  sent.length = 0;

  const req = { body, query: {}, headers: {}, on: vi.fn() } as unknown as Request;
  const res = { write: vi.fn() } as unknown as Response;
  await processGraphRequestStreaming(routeType, req, res);

  expect(sent).not.toContain('error');
  expect(sent).toContain('done');
  expect(mockGetModel).toHaveBeenCalledTimes(1);

  const streamArgs = mockStreamText.mock.calls[0]?.[0] as Record<string, unknown>;
  return {
    getModelCalls: mockGetModel.mock.calls,
    maxOutputTokens: streamArgs.maxOutputTokens,
    providerOptions: streamArgs.providerOptions,
  };
}

describe('processGraphRequestStreaming', () => {
  beforeEach(() => {
    vi.stubEnv('MAIN_LLM_OVERRIDE', '');
    mockStreamText.mockImplementation(() => ({
      stream: (async function* () {
        yield { type: 'text-delta', text: 'ok' };
      })(),
    }));
  });

  it.each(ROUTE_TYPES)(
    '%s is answered the same whatever provider, model or reasoningEffort the body names',
    async (routeType) => {
      const plain = await answer(routeType, baseBody(routeType));
      const named = await answer(routeType, {
        ...baseBody(routeType),
        provider: 'greenpt',
        model: 'body-chosen-model',
        reasoningEffort: 'high',
      });

      expect(named).toEqual(plain);
    }
  );
});

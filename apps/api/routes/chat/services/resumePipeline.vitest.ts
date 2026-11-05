import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DraftFailedError } from '../../../services/sharepicCreator/draftFailure.js';

import { runChatGraphResume } from './resumePipeline.js';

import type { Request } from 'express';

vi.mock('../../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

// Heavy collaborators the sharepic branch never reaches.
vi.mock('../../../agents/langgraph/ChatGraph/index.js', () => ({}));
vi.mock('../../../agents/langgraph/ChatGraph/types.js', () => ({}));
vi.mock('../../../services/ai/promptCacheKey.js', () => ({}));
vi.mock('../../../services/chat/resumableStreams.js', () => ({}));
vi.mock('../../../services/telemetry/langfuseTelemetry.js', () => ({}));
vi.mock('../agents/providers.js', () => ({}));
vi.mock('./agenticLoop/approvalResume.js', () => ({}));
vi.mock('./agenticLoop/clarificationResume.js', () => ({}));
vi.mock('./agenticLoop/clientToolRegistry.js', () => ({}));
vi.mock('./agenticLoop/clientToolResume.js', () => ({}));
vi.mock('./attachmentProcessingService.js', () => ({}));
vi.mock('./contextPruningService.js', () => ({}));
vi.mock('./imageVisibility.js', () => ({}));
vi.mock('./pendingAssistantWriter.js', () => ({}));
vi.mock('./responseStreamingService.js', () => ({}));
vi.mock('./threadPersistenceService.js', () => ({ getUser: () => ({ id: 'u1' }) }));
vi.mock('./turnMaterial.js', () => ({}));

const executeIntentPipeline = vi.fn<(o: unknown) => Promise<unknown>>();
vi.mock('./intentExecutionService.js', () => ({
  executeIntentPipeline: (o: unknown): Promise<unknown> => executeIntentPipeline(o),
  reportUnavailableSources: vi.fn(),
}));

vi.mock('./loopClarificationStateStore.js', () => ({
  loopClarificationStateStore: { get: async () => null, delete: vi.fn() },
}));
vi.mock('./loopClientToolStateStore.js', () => ({ loopClientToolStateStore: {} }));

const classifiedState = {
  intent: 'sharepic',
  messages: [{ role: 'user', content: 'Mach ein Sharepic' }],
  clarificationKind: undefined,
};
vi.mock('./pipelineStateStore.js', () => ({
  pipelineStateStore: {
    get: async () => ({
      classifiedState,
      requestContext: { userId: 'u1', processedMeta: [], validMessages: [], actualThreadId: 't1' },
    }),
    delete: vi.fn(),
  },
}));
vi.mock('./postResponseService.js', () => ({
  persistResumedResponse: async () => ({ ok: true, discarded: false }),
}));

describe('runChatGraphResume — sharepic resume', () => {
  beforeEach(() => executeIntentPipeline.mockReset());

  it('tells the person what the failed draft needs instead of blaming the topic', async () => {
    executeIntentPipeline.mockResolvedValue({
      finalState: classifiedState,
      generatedImage: null,
      sharepicVariants: [],
      sharepicFailure: new DraftFailedError('x', {
        kind: 'material',
        form: 'diagramm',
        ask: 'mindestens zwei Zahlen',
      }),
    });
    const events: { type: string; data: Record<string, unknown> }[] = [];
    const sse = {
      send: (type: string, data: Record<string, unknown>) => events.push({ type, data }),
      end: vi.fn(),
    };

    await runChatGraphResume({
      req: {} as Request,
      body: { threadId: 't1', resume: 'Verkehr' } as never,
      sse: sse as never,
    });

    const text = events.find((e) => e.type === 'text_delta')?.data.text as string;
    expect(text).toContain('mindestens zwei Zahlen');
    expect(text).not.toContain('Thema');
  });
});

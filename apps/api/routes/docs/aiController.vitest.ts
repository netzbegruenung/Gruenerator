import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { Request, Response } from 'express';

// ─── Module mocks (hoisted before imports) ────────────────────

const mockStreamText = vi.fn();
const mockConvertToModelMessages = vi.fn();

vi.mock('ai', () => ({
  streamText: mockStreamText,
  convertToModelMessages: mockConvertToModelMessages,
  UIMessage: {},
}));

const mockInjectDocumentStateMessages = vi.fn();
const mockToolDefinitionsToToolSet = vi.fn();

vi.mock('@blocknote/xl-ai/server', () => ({
  injectDocumentStateMessages: mockInjectDocumentStateMessages,
  toolDefinitionsToToolSet: mockToolDefinitionsToToolSet,
  aiDocumentFormats: { html: { systemPrompt: 'You are a document editor.' } },
}));

const mockGetModel = vi.fn();
const mockIsProviderConfigured = vi.fn();

vi.mock('../../routes/chat/agents/providers.js', () => ({
  getModel: mockGetModel,
  isProviderConfigured: mockIsProviderConfigured,
}));

const mockLogInfo = vi.fn();
const mockLogWarn = vi.fn();
const mockLogError = vi.fn();

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
  }),
}));

vi.mock('../../utils/keycloak/index.js', async () => {
  const { Router } = await import('express');
  return { createAuthenticatedRouter: () => Router() };
});

// ─── Import handler after mocks are in place ──────────────────

const { handleAiRequest } = await import('./aiController.js');

// ─── Test helpers ─────────────────────────────────────────────

function createMockReq(body: Record<string, unknown> = {}): Request {
  return { body } as unknown as Request;
}

function createMockRes() {
  const res: Record<string, unknown> = {};
  const jsonFn = vi.fn();
  const statusFn = vi.fn(() => ({ json: jsonFn }));
  res.status = statusFn;
  res.json = jsonFn;
  return { res: res as unknown as Response, statusFn, jsonFn };
}

const sampleMessages = [
  { id: 'msg-1', role: 'user', parts: [{ type: 'text', text: 'Make the first paragraph bold' }] },
];

const sampleToolDefinitions = {
  applyDocumentOperations: {
    description: 'Apply operations',
    parameters: {
      type: 'object',
      properties: { operations: { type: 'array' } },
      required: ['operations'],
    },
  },
};

function setupHappyPath() {
  mockIsProviderConfigured.mockReturnValue(true);
  mockGetModel.mockReturnValue({ modelId: 'gpt-oss:120b' });
  mockInjectDocumentStateMessages.mockImplementation((msgs: unknown[]) => [...msgs]);
  mockToolDefinitionsToToolSet.mockReturnValue({ applyDocumentOperations: {} });
  mockConvertToModelMessages.mockResolvedValue([{ role: 'user', content: 'test' }]);

  const mockPipe = vi.fn();
  mockStreamText.mockReturnValue({ pipeUIMessageStreamToResponse: mockPipe });

  return { mockPipe };
}

// ─── Tests ────────────────────────────────────────────────────

describe('aiController – POST /api/docs/ai', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Validation ────────────────────────────────────────────

  describe('Validation', () => {
    it('returns 400 when messages is missing', async () => {
      const { res, statusFn, jsonFn } = createMockRes();
      const req = createMockReq({ toolDefinitions: sampleToolDefinitions });

      await handleAiRequest(req, res);

      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({ error: 'Messages array is required' });
    });

    it('returns 400 when messages is not an array', async () => {
      const { res, statusFn, jsonFn } = createMockRes();
      const req = createMockReq({
        messages: 'not-an-array',
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({ error: 'Messages array is required' });
    });

    it('returns 400 when toolDefinitions is missing', async () => {
      const { res, statusFn, jsonFn } = createMockRes();
      const req = createMockReq({ messages: sampleMessages });

      await handleAiRequest(req, res);

      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({ error: 'Tool definitions object is required' });
    });

    it('returns 400 when toolDefinitions is not an object', async () => {
      const { res, statusFn, jsonFn } = createMockRes();
      const req = createMockReq({ messages: sampleMessages, toolDefinitions: 'bad' });

      await handleAiRequest(req, res);

      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({ error: 'Tool definitions object is required' });
    });

    it('returns 400 when toolDefinitions is null', async () => {
      const { res, statusFn, jsonFn } = createMockRes();
      const req = createMockReq({ messages: sampleMessages, toolDefinitions: null });

      await handleAiRequest(req, res);

      expect(statusFn).toHaveBeenCalledWith(400);
      expect(jsonFn).toHaveBeenCalledWith({ error: 'Tool definitions object is required' });
    });
  });

  // ── Provider configuration ────────────────────────────────

  describe('Provider configuration', () => {
    it('returns 500 when mistral is not configured', async () => {
      mockIsProviderConfigured.mockReturnValue(false);
      const { res, statusFn, jsonFn } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(statusFn).toHaveBeenCalledWith(500);
      expect(jsonFn).toHaveBeenCalledWith({ error: 'AI provider not configured' });
    });

    it('logs error when provider is not configured', async () => {
      mockIsProviderConfigured.mockReturnValue(false);
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockLogError).toHaveBeenCalledWith('[DocsAI] Mistral provider not configured');
    });
  });

  // ── Happy path ────────────────────────────────────────────

  describe('Happy path', () => {
    it('calls isProviderConfigured with mistral', async () => {
      const { mockPipe } = setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockIsProviderConfigured).toHaveBeenCalledWith('mistral');
      expect(mockPipe).toHaveBeenCalled();
    });

    it('calls getModel with mistral and mistral-large-latest', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockGetModel).toHaveBeenCalledWith('mistral', 'mistral-large-latest');
    });

    it('calls injectDocumentStateMessages with the messages', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockInjectDocumentStateMessages).toHaveBeenCalledWith(sampleMessages);
    });

    it('calls toolDefinitionsToToolSet with the tool definitions', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockToolDefinitionsToToolSet).toHaveBeenCalledWith(sampleToolDefinitions);
    });

    it('passes correct options to streamText', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockStreamText).toHaveBeenCalledOnce();
      const opts = mockStreamText.mock.calls[0][0];
      expect(opts.model).toEqual({ modelId: 'gpt-oss:120b' });
      expect(opts.system).toBe('You are a document editor.');
      expect(opts.toolChoice).toBe('required');
      expect(opts.maxOutputTokens).toBe(4096);
      expect(opts.temperature).toBe(0.3);
    });

    it('calls convertToModelMessages with injected messages', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockConvertToModelMessages).toHaveBeenCalledWith(sampleMessages);
    });

    it('pipes the stream result to response', async () => {
      const { mockPipe } = setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockPipe).toHaveBeenCalledWith(res);
    });
  });

  // ── Diagnostic logging ────────────────────────────────────

  describe('Diagnostic logging', () => {
    it('logs tool definition names on request', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockLogInfo).toHaveBeenCalledWith(
        expect.stringContaining('Tool definitions received: applyDocumentOperations')
      );
    });

    it('logs message count', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockLogInfo).toHaveBeenCalledWith(
        expect.stringContaining('Request received: 1 messages')
      );
    });

    it('logs message count after doc state injection', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockLogInfo).toHaveBeenCalledWith(
        expect.stringContaining('Messages after doc state injection:')
      );
    });

    it('logs tool count before streaming', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(mockLogInfo).toHaveBeenCalledWith(
        expect.stringContaining('Streaming response with 1 tools')
      );
    });
  });

  // ── onFinish callback ─────────────────────────────────────

  describe('onFinish callback', () => {
    it('logs finish reason and tool call count', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      const { onFinish } = mockStreamText.mock.calls[0][0];
      onFinish({
        finishReason: 'tool-calls',
        toolCalls: [{ toolName: 'applyDocumentOperations', input: { operations: [] } }],
        text: '',
        usage: { inputTokens: 100, outputTokens: 50 },
      });

      expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('reason: tool-calls'));
      expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('toolCalls: 1'));
    });

    it('logs individual tool call details', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      const { onFinish } = mockStreamText.mock.calls[0][0];
      onFinish({
        finishReason: 'tool-calls',
        toolCalls: [
          { toolName: 'applyDocumentOperations', input: { operations: [{ type: 'update' }] } },
        ],
        text: '',
        usage: null,
      });

      expect(mockLogInfo).toHaveBeenCalledWith(
        expect.stringContaining('Tool[0]: applyDocumentOperations')
      );
      expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('args size:'));
    });

    it('warns when no tool calls are returned', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      const { onFinish } = mockStreamText.mock.calls[0][0];
      onFinish({
        finishReason: 'stop',
        toolCalls: [],
        text: 'I made it bold!',
        usage: null,
      });

      expect(mockLogWarn).toHaveBeenCalledWith(
        expect.stringContaining('NO tool calls in response')
      );
    });

    it('logs token usage when available', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      const { onFinish } = mockStreamText.mock.calls[0][0];
      onFinish({
        finishReason: 'tool-calls',
        toolCalls: [{ toolName: 'applyDocumentOperations', input: {} }],
        text: '',
        usage: { inputTokens: 350, outputTokens: 120 },
      });

      expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('input: 350'));
      expect(mockLogInfo).toHaveBeenCalledWith(expect.stringContaining('output: 120'));
    });

    it('does not log tokens when usage is missing', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      const { onFinish } = mockStreamText.mock.calls[0][0];
      mockLogInfo.mockClear();
      onFinish({
        finishReason: 'stop',
        toolCalls: [],
        text: '',
        usage: undefined,
      });

      const tokenCalls = mockLogInfo.mock.calls.filter(
        (c: unknown[]) => typeof c[0] === 'string' && c[0].includes('Tokens')
      );
      expect(tokenCalls).toHaveLength(0);
    });
  });

  // ── onError callback ──────────────────────────────────────

  describe('onError callback', () => {
    it('logs stream errors', async () => {
      setupHappyPath();
      const { res } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      const { onError } = mockStreamText.mock.calls[0][0];
      const streamErr = new Error('LiteLLM proxy connection refused');
      onError({ error: streamErr });

      expect(mockLogError).toHaveBeenCalledWith('[DocsAI] Stream error:', streamErr);
    });
  });

  // ── Exception handling ────────────────────────────────────

  describe('Exception handling', () => {
    it('returns 500 when streamText throws', async () => {
      setupHappyPath();
      mockStreamText.mockImplementation(() => {
        throw new Error('Model initialization failed');
      });
      const { res, statusFn, jsonFn } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(statusFn).toHaveBeenCalledWith(500);
      expect(jsonFn).toHaveBeenCalledWith({
        error: 'AI processing failed',
        details: 'Model initialization failed',
      });
    });

    it('returns generic message for non-Error exceptions', async () => {
      setupHappyPath();
      mockStreamText.mockImplementation(() => {
        throw 'string-error';
      });
      const { res, statusFn, jsonFn } = createMockRes();
      const req = createMockReq({
        messages: sampleMessages,
        toolDefinitions: sampleToolDefinitions,
      });

      await handleAiRequest(req, res);

      expect(statusFn).toHaveBeenCalledWith(500);
      expect(jsonFn).toHaveBeenCalledWith({
        error: 'AI processing failed',
        details: 'Unknown error',
      });
    });
  });
});

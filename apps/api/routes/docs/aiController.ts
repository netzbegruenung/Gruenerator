/**
 * Docs AI Controller
 * Handles AI-powered document editing via BlockNote xl-ai extension
 */

import { TransformStream } from 'node:stream/web';

import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from '@blocknote/xl-ai/server';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { type Response } from 'express';

import { rateLimitMiddleware } from '../../middleware/rateLimitMiddleware.js';
import { type RateLimitRequest } from '../../middleware/types.js';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { createLogger } from '../../utils/logger.js';
import { getModel, isProviderConfigured } from '../chat/agents/providers.js';
import { type AgentConfig } from '../chat/agents/types.js';

const log = createLogger('DocsAI');
const router = createAuthenticatedRouter();

/**
 * Deterministic mapping of common LLM synonym types to BlockNote's valid types.
 * GPT-OSS consistently generates "replace" instead of "update" and "insert" instead of "add".
 * BlockNote xl-ai only accepts: "add", "update", "delete".
 */
const OPERATION_TYPE_ALIASES: Record<string, string> = {
  replace: 'update',
  replaceBlock: 'update',
  modify: 'update',
  edit: 'update',
  insert: 'add',
  insertBlock: 'add',
  addBlock: 'add',
  append: 'add',
  remove: 'delete',
  removeBlock: 'delete',
  deleteBlock: 'delete',
};

/**
 * Recursively normalizes LLM operation types in a UIMessageChunk object.
 * Fixes tool call inputs where the LLM generates "replace" instead of "update", etc.
 * Works on the parsed JSON object level (before SSE serialization).
 */
function normalizeChunkOperationTypes(chunk: Record<string, unknown>): Record<string, unknown> {
  // Only process tool-input-delta and tool-input-available chunks
  const chunkType = chunk.type as string;

  if (chunkType === 'tool-input-delta') {
    const delta = chunk.inputTextDelta as string | undefined;
    if (delta) {
      const normalized = delta.replace(/"type"\s*:\s*"(\w+)"/g, (match, type: string) => {
        const alias = OPERATION_TYPE_ALIASES[type];
        if (alias) {
          log.info(`[DocsAI] Normalized operation type "${type}" → "${alias}"`);
          return `"type":"${alias}"`;
        }
        return match;
      });
      if (normalized !== delta) {
        return { ...chunk, inputTextDelta: normalized };
      }
    }
  }

  if (chunkType === 'tool-input-available') {
    const input = chunk.input as { operations?: Array<{ type?: string }> } | undefined;
    if (input?.operations) {
      let changed = false;
      const normalizedOps = input.operations.map((op) => {
        const alias = op.type ? OPERATION_TYPE_ALIASES[op.type] : null;
        if (alias) {
          log.info(`[DocsAI] Normalized operation type "${op.type}" → "${alias}"`);
          changed = true;
          return { ...op, type: alias };
        }
        return op;
      });
      if (changed) {
        return { ...chunk, input: { ...input, operations: normalizedOps } };
      }
    }
  }

  return chunk;
}

/**
 * Creates a TransformStream that normalizes operation types in UIMessageChunk objects.
 * Operates on JSON objects before SSE serialization.
 */
function createNormalizingTransform(): TransformStream<
  Record<string, unknown>,
  Record<string, unknown>
> {
  return new TransformStream({
    transform(chunk: Record<string, unknown>, controller) {
      const chunkType = chunk.type as string;
      if (chunkType === 'tool-input-delta' || chunkType === 'tool-input-available') {
        log.info(
          `[DocsAI] Stream chunk (${chunkType}): ${JSON.stringify(chunk).substring(0, 500)}`
        );
      }
      controller.enqueue(normalizeChunkOperationTypes(chunk));
    },
  });
}

/**
 * Strict prompt for BlockNote document operations.
 * Modeled after suitenumerique/docs (github.com/suitenumerique/docs).
 * Explicitly lists valid operation shapes so the LLM doesn't hallucinate types.
 */
const BLOCKNOTE_TOOL_STRICT_PROMPT = `
You are editing a BlockNote document via the tool applyDocumentOperations.

You MUST respond ONLY by calling applyDocumentOperations.
The tool input MUST be valid JSON:
{ "operations": [ ... ] }

Each operation MUST include "type" and it MUST be one of:
- "update" (requires: id, block)
- "add"    (requires: referenceId, position, blocks)
- "delete" (requires: id)

VALID SHAPES (FOLLOW EXACTLY):

Update:
{ "type":"update", "id":"<id$>", "block":"<p>...</p>" }
IMPORTANT: "block" MUST be a STRING containing a SINGLE valid HTML element.

Add:
{ "type":"add", "referenceId":"<id$>", "position":"before|after", "blocks":["<p>...</p>"] }
IMPORTANT: "blocks" MUST be an ARRAY OF STRINGS.
Each item MUST be a STRING containing a SINGLE valid HTML element.

Delete:
{ "type":"delete", "id":"<id$>" }

IDs ALWAYS end with "$". Use ids EXACTLY as provided.
Do NOT use "replace", "insert", "modify", or any other type value.
Return ONLY the JSON tool input. No prose, no markdown.`;

interface AIRequestBody {
  messages: UIMessage[];
  toolDefinitions: Record<string, unknown>;
}

/**
 * @route   POST /api/docs/ai
 * @desc    Process AI requests for document editing
 * @access  Private
 */
export async function handleAiRequest(req: RateLimitRequest, res: Response) {
  try {
    const { messages, toolDefinitions } = req.body as AIRequestBody;

    log.info(
      `[DocsAI] Request received: ${messages?.length || 0} messages, ${Object.keys(toolDefinitions || {}).length} tools`
    );
    log.info(
      `[DocsAI] Tool definitions received: ${Object.keys(toolDefinitions || {}).join(', ') || 'NONE'}`
    );

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    if (!toolDefinitions || typeof toolDefinitions !== 'object') {
      return res.status(400).json({ error: 'Tool definitions object is required' });
    }

    const providerChain: AgentConfig['provider'][] = ['litellm', 'regolo', 'mistral'];
    const provider = providerChain.find((p) => isProviderConfigured(p));

    if (!provider) {
      log.error('[DocsAI] No AI provider configured (tried: litellm, regolo, mistral)');
      return res.status(500).json({ error: 'AI provider not configured' });
    }

    log.info(`[DocsAI] Using provider: ${provider}`);
    const model = getModel(provider, 'mistral-large-latest');

    const messagesWithDocState = injectDocumentStateMessages(messages);
    log.info(
      `[DocsAI] Messages after doc state injection: ${messagesWithDocState.length} messages`
    );

    // DEBUG: Log document state sent to LLM (block IDs for cross-reference with tool call args)
    for (const msg of messagesWithDocState) {
      const parts = Array.isArray(msg.parts) ? msg.parts : [];
      const content = parts
        .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('');
      const idMatches = content.match(/data-id="([^"]+)"/g);
      if (idMatches && idMatches.length > 0) {
        const ids = idMatches.map((m: string) => m.replace(/data-id="|"/g, ''));
        log.info(`[DocsAI] Document block IDs sent to LLM (${ids.length}): ${ids.join(', ')}`);
      }
    }

    const tools = toolDefinitionsToToolSet(
      toolDefinitions as Parameters<typeof toolDefinitionsToToolSet>[0]
    );

    log.info(
      `[DocsAI] Streaming response with ${Object.keys(tools).length} tools: ${Object.keys(tools).join(', ')}`
    );

    const result = streamText({
      model,
      system: aiDocumentFormats.html.systemPrompt + '\n\n' + BLOCKNOTE_TOOL_STRICT_PROMPT,
      messages: await convertToModelMessages(messagesWithDocState),
      tools,
      toolChoice: 'auto',
      maxOutputTokens: 4096,
      temperature: 0.3,
      onFinish: ({ toolCalls, text, finishReason, usage }) => {
        log.info(
          `[DocsAI] Stream finished — reason: ${finishReason}, toolCalls: ${toolCalls?.length || 0}, text length: ${text?.length || 0}`
        );
        if (toolCalls?.length) {
          toolCalls.forEach((tc, i) => {
            const argsJson = JSON.stringify(tc.input);
            log.info(`[DocsAI]   Tool[${i}]: ${tc.toolName}, args size: ${argsJson.length} chars`);
            log.info(`[DocsAI]   Tool[${i}] full args: ${argsJson}`);
          });
        } else {
          log.warn(
            '[DocsAI] NO tool calls in response — model may not support tool calling properly'
          );
        }
        if (usage) {
          log.info(`[DocsAI] Tokens — input: ${usage.inputTokens}, output: ${usage.outputTokens}`);
        }
      },
      onError: ({ error }) => {
        log.error('[DocsAI] Stream error:', error);
      },
    });

    // toUIMessageStream() produces JSON objects (UIMessageChunks).
    // DefaultChatTransport expects SSE format (data: {...}\n\n).
    // Pipeline: JSON chunks → normalize operation types → SSE framing → response
    const stream = result.toUIMessageStream();

    // @ts-expect-error Node.js TransformStream vs Web API TransformStream type mismatch
    const normalizedStream = stream.pipeThrough(createNormalizingTransform());

    // Convert JSON objects to SSE format: data: ${JSON.stringify(chunk)}\n\n
    // @ts-expect-error Node.js TransformStream vs Web API TransformStream type mismatch
    const sseStream = normalizedStream.pipeThrough(
      new TransformStream({
        transform(chunk: unknown, controller) {
          controller.enqueue(`data: ${JSON.stringify(chunk)}\n\n`);
        },
        flush(controller) {
          controller.enqueue('data: [DONE]\n\n');
        },
      })
    );

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reader = (sseStream as ReadableStream<any>).getReader();
    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          res.end();
          break;
        }
        res.write(value);
      }
    };
    pump().catch((err) => {
      log.error('[DocsAI] Stream pipe error:', err);
      res.end();
    });
  } catch (error) {
    log.error('[DocsAI] Error processing AI request:', error);
    return res.status(500).json({
      error: 'AI processing failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

router.post('/ai', rateLimitMiddleware('docs_ai', { autoIncrement: true }), handleAiRequest);

export default router;

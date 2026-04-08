/**
 * Docs AI Controller
 * Handles AI-powered document editing via BlockNote xl-ai extension
 */

import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from '@blocknote/xl-ai/server';
import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { Router, type Request, type Response } from 'express';

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
 * Normalizes LLM operation types in SSE stream chunks before they reach BlockNote.
 * Transforms known synonyms to the three valid types: add, update, delete.
 */
function normalizeOperationTypes(text: string): string {
  return text.replace(/"type"\s*:\s*"(\w+)"/g, (match, type: string) => {
    const normalized = OPERATION_TYPE_ALIASES[type];
    if (normalized) {
      log.info(`[DocsAI] Normalized operation type "${type}" → "${normalized}"`);
      return `"type":"${normalized}"`;
    }
    return match;
  });
}

/**
 * Creates a TransformStream that normalizes operation types in the SSE stream.
 */
function createNormalizingTransform(): TransformStream<string, string> {
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(normalizeOperationTypes(chunk));
    },
  });
}

interface AIRequestBody {
  messages: UIMessage[];
  toolDefinitions: Record<string, unknown>;
}

/**
 * @route   POST /api/docs/ai
 * @desc    Process AI requests for document editing
 * @access  Private
 */
export async function handleAiRequest(req: Request, res: Response) {
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

    const tools = toolDefinitionsToToolSet(
      toolDefinitions as Parameters<typeof toolDefinitionsToToolSet>[0]
    );

    log.info(
      `[DocsAI] Streaming response with ${Object.keys(tools).length} tools: ${Object.keys(tools).join(', ')}`
    );

    const systemPromptSuffix = `

CRITICAL: Each operation in the "operations" array MUST use a "type" value that is EXACTLY one of these three strings: "add", "update", or "delete".
- To modify or replace a block's content, use "type": "update" (NOT "replace", "modify", or "edit").
- To insert new blocks, use "type": "add" (NOT "insert", "append", or "addBlock").
- To remove a block, use "type": "delete" (NOT "remove" or "deleteBlock").
No other type values are valid.`;

    const result = streamText({
      model,
      system: aiDocumentFormats.html.systemPrompt + systemPromptSuffix,
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
            log.info(
              `[DocsAI]   Tool[${i}]: ${tc.toolName}, args size: ${JSON.stringify(tc.input).length} chars`
            );
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

    const stream = result.toUIMessageStream();
    const normalizedStream = stream.pipeThrough(createNormalizingTransform());

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = normalizedStream.getReader();
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

router.post('/ai', handleAiRequest);

export default router;

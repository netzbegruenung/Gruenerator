/**
 * Docs AI Controller
 * Handles AI-powered document editing via BlockNote xl-ai extension
 *
 * Uses the Vercel AI SDK's pipeUIMessageStreamToResponse() to stream SSE-framed
 * UIMessageChunks directly to Express. This matches the format that
 * DefaultChatTransport's EventSourceParserStream expects on the frontend.
 */

import { type ServerResponse } from 'node:http';

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
            log.info(`[DocsAI]   Tool[${i}]: ${tc.toolName}, args: ${JSON.stringify(tc.input)}`);
          });
        }
        if (usage) {
          log.info(`[DocsAI] Tokens — input: ${usage.inputTokens}, output: ${usage.outputTokens}`);
        }
      },
      onError: ({ error }) => {
        log.error('[DocsAI] Stream error:', error);
      },
    });

    // pipeUIMessageStreamToResponse handles:
    // 1. SSE framing (data: {...}\n\n) required by DefaultChatTransport's EventSourceParserStream
    // 2. Correct Content-Type and cache headers
    // 3. TextEncoder stream for binary transport
    // 4. [DONE] sentinel on stream end
    result.pipeUIMessageStreamToResponse(res as unknown as ServerResponse);
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

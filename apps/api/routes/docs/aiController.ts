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

const log = createLogger('DocsAI');
const router = createAuthenticatedRouter();

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

    if (!isProviderConfigured('mistral')) {
      log.error('[DocsAI] Mistral provider not configured');
      return res.status(500).json({ error: 'AI provider not configured' });
    }

    const model = getModel('mistral', 'mistral-large-latest');

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

    const result = streamText({
      model,
      system: aiDocumentFormats.html.systemPrompt,
      messages: await convertToModelMessages(messagesWithDocState),
      tools,
      toolChoice: 'required',
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

    result.pipeUIMessageStreamToResponse(res);
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

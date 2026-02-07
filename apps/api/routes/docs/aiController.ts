/**
 * Docs AI Controller
 * Handles AI-powered document editing via BlockNote xl-ai extension
 */

import { Router, Request, Response } from 'express';
import { streamText, convertToModelMessages, UIMessage } from 'ai';
import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from '@blocknote/xl-ai/server';
import { createAuthenticatedRouter } from '../../utils/keycloak/index.js';
import { getModel, isProviderConfigured } from '../chat/agents/providers.js';
import { createLogger } from '../../utils/logger.js';

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
router.post('/ai', async (req: Request, res: Response) => {
  try {
    const { messages, toolDefinitions } = req.body as AIRequestBody;

    log.info(`[DocsAI] Request received: ${messages?.length || 0} messages, ${Object.keys(toolDefinitions || {}).length} tools`);

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

    const model = getModel('mistral', 'mistral-large-2512');

    const messagesWithDocState = injectDocumentStateMessages(messages);

    const tools = toolDefinitionsToToolSet(toolDefinitions as Parameters<typeof toolDefinitionsToToolSet>[0]);

    log.info(`[DocsAI] Streaming response with ${Object.keys(tools).length} tools`);

    const result = streamText({
      model,
      system: aiDocumentFormats.html.systemPrompt,
      messages: await convertToModelMessages(messagesWithDocState),
      tools,
      toolChoice: 'required',
      maxOutputTokens: 4096,
      temperature: 0.3,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    log.error('[DocsAI] Error processing AI request:', error);
    return res.status(500).json({
      error: 'AI processing failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;

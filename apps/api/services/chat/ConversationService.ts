/**
 * Conversation Service
 * Handles conversational chat interactions with AI
 */

import { createLogger } from '../../utils/logger.js';
import { localizePlaceholders } from '../localization/index.js';
import type { Locale } from '../localization/types.js';
import * as chatMemory from './index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const log = createLogger('ConversationService');

// Get __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Configuration constants
 */
const CONFIG = {
  MAX_HISTORY_MESSAGES: 10
};

/**
 * Cache for conversation config
 */
let conversationConfigCache: any = null;

/**
 * Load conversation config from JSON file (with caching)
 */
function loadConversationConfig(): any {
  if (conversationConfigCache) return conversationConfigCache;

  const configPath = path.join(__dirname, '../../prompts/conversation.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  conversationConfigCache = config;
  return config;
}

/**
 * Build messages array from conversation history
 */
function buildConversationMessages(
  history: any[] | undefined,
  currentMessage: string
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  // Add recent history (limited to prevent context overflow)
  if (history && history.length > 0) {
    const recentHistory = history.slice(-CONFIG.MAX_HISTORY_MESSAGES);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    }
  }

  // Add current message
  messages.push({ role: 'user', content: currentMessage });

  return messages;
}

/**
 * Process conversation request
 */
export async function processConversationRequest(params: {
  message: string;
  userId: string;
  locale?: Locale;
  subIntent?: string;
  messageHistory?: any[];
  aiWorkerPool: any;
  req?: any;
}): Promise<any> {
  const { message, userId, locale = 'de-DE', subIntent = 'general', messageHistory, aiWorkerPool, req } = params;

  log.debug('[ConversationService] Processing conversation request:', {
    subIntent,
    messageLength: message?.length,
    hasHistory: messageHistory?.length > 0
  });

  try {
    // Load conversation config
    const conversationConfig = loadConversationConfig();
    const subIntentConfig = conversationConfig.subIntents[subIntent] || conversationConfig.subIntents.general;

    // Determine if pro mode should be used for complex tasks
    const useProMode = subIntentConfig.useProMode || false;

    // Build system prompt with Green identity (localized)
    const systemPrompt = localizePlaceholders(conversationConfig.systemRole, locale);

    // Build user message with sub-intent instruction
    let userMessage = message;
    if (subIntentConfig.instruction) {
      userMessage = `${subIntentConfig.instruction}\n\n${message}`;
    }

    // Build messages array with conversation history
    const messages = buildConversationMessages(messageHistory, userMessage);

    // Determine options based on mode
    const options = useProMode ? conversationConfig.proModeOptions : conversationConfig.options;

    log.debug('[ConversationService] Calling AI for conversation:', {
      subIntent,
      useProMode,
      messageCount: messages.length,
      temperature: options.temperature,
      maxTokens: options.max_tokens
    });

    const result = await aiWorkerPool.processRequest({
      type: 'conversation',
      systemPrompt: systemPrompt,
      messages: messages,
      options: {
        ...options,
        useProMode: useProMode
      }
    }, req);

    if (!result.success) {
      throw new Error(result.error || 'AI request failed');
    }

    // Store in chat memory
    await chatMemory.addMessage(userId, 'assistant', result.content, 'conversation');

    log.debug('[ConversationService] Conversation response generated:', {
      subIntent,
      responseLength: result.content?.length,
      useProMode
    });

    return {
      success: true,
      agent: 'conversation',
      subIntent: subIntent,
      content: {
        text: result.content,
        type: 'conversation'
      },
      metadata: {
        useProMode: useProMode,
        subIntent: subIntent
      }
    };
  } catch (error) {
    log.error('[ConversationService] Error:', error);
    throw error;
  }
}

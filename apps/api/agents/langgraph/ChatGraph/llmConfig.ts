/**
 * LLM Configuration for Deep Agent
 *
 * Provides LangChain-compatible model instances for use with createReactAgent.
 * The current chat system uses AI SDK models (@ai-sdk/mistral), but LangGraph's
 * prebuilt agents require LangChain's BaseChatModel interface.
 */

import { ChatMistralAI } from '@langchain/mistralai';

import type { AgentConfig } from '../../../routes/chat/agents/types.js';

export interface AgentLLMConfig {
  agentConfig: AgentConfig;
  modelId?: string;
}

/**
 * Model presets for different use cases.
 * Maps user-facing model IDs to LangChain-compatible model names.
 */
const MODEL_MAP: Record<string, string> = {
  'mistral-large': 'mistral-large-latest',
  'mistral-medium': 'mistral-medium-latest',
  'magistral-medium': 'magistral-medium-latest',
  'pixtral-large': 'pixtral-large-latest',
};

/**
 * Create a LangChain-compatible Mistral model for the ReAct agent.
 *
 * Supports tool calling which is required by createReactAgent to let
 * the LLM autonomously decide which tools to invoke.
 */
export function getAgentLLM(config: AgentLLMConfig): ChatMistralAI {
  const { agentConfig, modelId } = config;

  let modelName: string;
  if (!modelId || modelId === 'auto') {
    modelName = agentConfig.defaultModel ?? agentConfig.model;
  } else if (MODEL_MAP[modelId]) {
    modelName = MODEL_MAP[modelId];
  } else {
    modelName = agentConfig.model;
  }

  return new ChatMistralAI({
    model: modelName,
    temperature: agentConfig.params.temperature,
    maxTokens: agentConfig.params.max_tokens,
    apiKey: process.env.MISTRAL_API_KEY,
  });
}

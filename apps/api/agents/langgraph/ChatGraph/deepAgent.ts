/**
 * Deep Agent — ReAct Agent using LangGraph's createReactAgent
 *
 * Default chat pipeline. Replaces the fixed pipeline (classify → search →
 * rerank → respond) with an autonomous agent that decides which tools to
 * call based on the conversation.
 *
 * The LLM:
 * - Reasons about what information it needs
 * - Selects appropriate tools (search_documents, web_search, etc.)
 * - Observes tool results
 * - Iterates if results are insufficient
 * - Generates the final response when it has enough context
 */

import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { createReactAgent } from '@langchain/langgraph/prebuilt';

import { getAgent, getDefaultAgentId } from '../../../routes/chat/agents/agentLoader.js';
import { createLogger } from '../../../utils/logger.js';

import { getAgentLLM } from './llmConfig.js';
import { buildDeepAgentSystemPrompt } from './systemPrompt.js';
import { buildTools } from './tools/registry.js';

import type { ToolDependencies } from './tools/registry.js';
import type { ThreadAttachment, GeneratedImageResult, ImageAttachment } from './types.js';
import type { AgentConfig } from '../../../routes/chat/agents/types.js';
import type { CompiledGraph } from '@langchain/langgraph';

const log = createLogger('DeepAgent');

/**
 * Input for creating a deep agent instance.
 */
export interface DeepAgentInput {
  agentId: string;
  userId: string;
  modelId?: string;
  enabledTools: Record<string, boolean>;
  aiWorkerPool: any;
  attachmentContext?: string;
  threadAttachments?: ThreadAttachment[];
  imageAttachments?: ImageAttachment[];
  memoryContext?: string | null;
  notebookContext?: string;
  notebookCollectionIds?: string[];
  userInstructions?: string;
}

/**
 * The created agent with its compiled graph and dependencies.
 */
export interface DeepAgentInstance {
  graph: CompiledGraph<any>;
  deps: ToolDependencies;
  agentConfig: AgentConfig;
  systemMessage: string;
}

/**
 * Create a deep agent instance.
 *
 * Returns a compiled LangGraph ReAct agent ready to stream events.
 * The graph uses createReactAgent which provides:
 * - An "agent" node (LLM with tool-calling)
 * - A "tools" node (executes selected tools)
 * - Automatic looping until LLM produces a final response
 */
export async function createDeepAgent(input: DeepAgentInput): Promise<DeepAgentInstance> {
  const agentConfig = await getAgent(input.agentId || getDefaultAgentId());
  if (!agentConfig) {
    throw new Error(`Agent not found: ${input.agentId}`);
  }

  // Inject userId for rate limiting and memory
  (agentConfig as any).userId = input.userId;

  const deps: ToolDependencies = {
    agentConfig,
    aiWorkerPool: input.aiWorkerPool,
    enabledTools: input.enabledTools,
    threadAttachments: input.threadAttachments,
    imageAttachments: input.imageAttachments,
    _generatedImage: null,
  };

  const llm = getAgentLLM({ agentConfig, modelId: input.modelId });
  const tools = buildTools(deps);

  const systemMessage = buildDeepAgentSystemPrompt({
    agentConfig,
    enabledTools: input.enabledTools,
    memoryContext: input.memoryContext,
    attachmentContext: input.attachmentContext,
    threadAttachments: input.threadAttachments,
    notebookContext: input.notebookContext,
    notebookCollectionIds: input.notebookCollectionIds,
    userInstructions: input.userInstructions,
  });

  log.info(`[DeepAgent] Creating agent with ${tools.length} tools, model=${agentConfig.model}`);

  const graph = createReactAgent({
    llm,
    tools,
    prompt: systemMessage,
  });

  return { graph, deps, agentConfig, systemMessage };
}

/**
 * Convert AI SDK ModelMessage format to LangChain BaseMessage format.
 * Handles both string content and parts array format.
 */
export function convertToLangChainMessages(
  messages: Array<{ role: string; content: any }>
): Array<HumanMessage | AIMessage> {
  const result: Array<HumanMessage | AIMessage> = [];

  for (const msg of messages) {
    const text = extractText(msg.content);

    if (msg.role === 'user') {
      result.push(new HumanMessage(text));
    } else if (msg.role === 'assistant') {
      if (text) {
        result.push(new AIMessage(text));
      }
    }
    // Skip system messages — handled via the prompt parameter
  }

  return result;
}

function extractText(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p: any) => p && typeof p === 'object' && p.type === 'text')
      .map((p: any) => p.text || '')
      .join('');
  }
  return String(content || '');
}

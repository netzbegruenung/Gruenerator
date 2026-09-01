/**
 * Centralized Tool Handler Service
 * Manages tool validation, processing, and provider-specific formatting
 */

import { PROVIDER_NAMES } from '../ai/providers.js';

import type {
  AIProvider,
  ClaudeTool,
  OpenAITool,
  Tool,
  ToolCall,
  ToolChoice,
  ToolPayload,
} from './types.js';

export class ToolHandler {
  /**
   * Validate tools array
   * Supports both Claude/Bedrock format and OpenAI/Mistral format
   * @param tools - Array of tool definitions
   * @returns True if tools are valid
   */
  static validateTools(tools: Tool[]): boolean {
    if (!Array.isArray(tools)) {
      console.warn('[ToolHandler] Tools must be an array');
      return false;
    }

    for (const tool of tools) {
      if ('type' in tool && tool.type === 'function') {
        const func = (tool as OpenAITool).function;

        if (!func.name || typeof func.name !== 'string') {
          console.warn('[ToolHandler] Tool missing valid name (OpenAI format):', tool);
          return false;
        }

        if (!func.description || typeof func.description !== 'string') {
          console.warn('[ToolHandler] Tool missing valid description (OpenAI format):', tool);
          return false;
        }

        if (!func.parameters || typeof func.parameters !== 'object') {
          console.warn('[ToolHandler] Tool missing valid parameters (OpenAI format):', tool);
          return false;
        }
      } else {
        const claudeTool = tool as ClaudeTool;
        if (!claudeTool.name || typeof claudeTool.name !== 'string') {
          console.warn('[ToolHandler] Tool missing valid name (Claude format):', tool);
          return false;
        }

        if (!claudeTool.description || typeof claudeTool.description !== 'string') {
          console.warn('[ToolHandler] Tool missing valid description (Claude format):', tool);
          return false;
        }

        if (!claudeTool.input_schema || typeof claudeTool.input_schema !== 'object') {
          console.warn('[ToolHandler] Tool missing valid input_schema (Claude format):', tool);
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Format tools for specific AI provider
   * Handles conversion between Claude/Bedrock and OpenAI/Mistral formats
   * @param tools - Array of tool definitions (Claude or OpenAI format)
   * @param provider - Provider name
   * @returns Formatted tools for the provider
   */
  static formatToolsForProvider(tools: Tool[], provider: AIProvider = 'mistral'): Tool[] {
    if (!this.validateTools(tools)) {
      throw new Error('Invalid tools provided to formatToolsForProvider');
    }

    const targetProvider = provider.toLowerCase() as AIProvider;
    // The gate is the provider catalogue, not a hand-picked subset: every
    // lane speaks the OpenAI wire format (see providerInstances.ts), so every
    // known provider gets the nested `function` shape. Until 28.08.2026 the
    // list here was `['litellm', 'mistral']` — stale since cortecs landed —
    // and every greenpt/cortecs/scaleway/regolo tool call logged "Unknown
    // provider" and shipped Claude-shaped tools as-is (Issue #3044).
    const isKnownProvider: boolean = PROVIDER_NAMES.includes(targetProvider);

    if (!isKnownProvider) {
      // A name outside the catalogue is not a provider lane, so there is no
      // target shape to convert to: pass through unchanged and warn once per
      // call (the pre-#3044 code warned once per tool).
      console.warn(`[ToolHandler] Unknown provider: ${provider}, returning tools as-is`);
      return tools;
    }

    return tools.map((tool) => {
      const isOpenAIFormat = 'type' in tool && tool.type === 'function' && 'function' in tool;

      if (isOpenAIFormat) {
        return tool;
      }

      // Convert Claude format to OpenAI format
      const claudeTool = tool as ClaudeTool;
      return {
        type: 'function',
        function: {
          name: claudeTool.name,
          description: claudeTool.description,
          parameters: claudeTool.input_schema,
        },
      } as OpenAITool;
    });
  }

  /**
   * Validate tool calls from AI response
   * @param toolCalls - Array of tool calls from AI
   * @param availableTools - Array of available tool definitions
   * @returns True if all tool calls are valid
   */
  static validateToolCalls(toolCalls: ToolCall[], availableTools: Tool[]): boolean {
    if (!Array.isArray(toolCalls)) {
      return false;
    }

    const availableToolNames = availableTools.map((t) => {
      if ('type' in t && t.type === 'function') {
        return (t as OpenAITool).function.name;
      }
      return (t as ClaudeTool).name;
    });

    for (const toolCall of toolCalls) {
      if (!toolCall.name || !availableToolNames.includes(toolCall.name)) {
        console.warn('[ToolHandler] Invalid tool call - unknown tool:', toolCall.name);
        return false;
      }

      if (!toolCall.id) {
        console.warn('[ToolHandler] Invalid tool call - missing id:', toolCall);
        return false;
      }

      if (!toolCall.input || typeof toolCall.input !== 'object') {
        console.warn('[ToolHandler] Invalid tool call - missing or invalid input:', toolCall);
        return false;
      }
    }

    return true;
  }

  /**
   * Extract and validate tools from request options
   * @param options - Request options
   * @param requestId - Request ID for logging
   * @param type - Request type for logging
   * @returns Validated tools array or null if no tools
   */
  static extractAndValidateTools(
    options: { tools?: Tool[] },
    requestId: string,
    type: string
  ): Tool[] | null {
    const { tools } = options;

    if (!tools) {
      return null;
    }

    if (!Array.isArray(tools) || tools.length === 0) {
      console.warn(`[ToolHandler] Invalid tools provided for ${requestId} (type: ${type}):`, tools);
      return null;
    }

    if (!this.validateTools(tools)) {
      console.error(`[ToolHandler] Tool validation failed for ${requestId} (type: ${type})`);
      return null;
    }

    console.log(`[ToolHandler] Validated ${tools.length} tools for ${requestId} (type: ${type})`);
    return tools;
  }

  /**
   * Prepare tools payload for provider
   * @param options - Request options
   * @param provider - Provider name
   * @param requestId - Request ID for logging
   * @param type - Request type for logging
   * @returns Tool payload object with tools and tool_choice if applicable
   */
  static prepareToolsPayload(
    options: {
      tools?: Tool[];
      tool_choice?: ToolChoice | string | { type: string; name?: string };
    },
    provider: AIProvider,
    requestId: string,
    type: string
  ): ToolPayload {
    const tools = this.extractAndValidateTools(options, requestId, type);

    if (!tools) {
      return {};
    }

    const payload: ToolPayload = {
      tools: this.formatToolsForProvider(tools, provider),
    };

    // Add tool_choice if specified
    if (options.tool_choice) {
      payload.tool_choice = options.tool_choice as ToolChoice;
      console.log(`[ToolHandler] Tool choice added for ${requestId}:`, options.tool_choice);
    }

    return payload;
  }

  /**
   * Log tool usage statistics
   * @param requestId - Request ID
   * @param type - Request type
   * @param provider - Provider used
   * @param tools - Tools provided
   * @param toolCalls - Tool calls made by AI
   */
  static logToolUsage(
    requestId: string,
    type: string,
    provider: AIProvider,
    tools: Tool[] = [],
    toolCalls: ToolCall[] = []
  ): void {
    console.log(`[ToolHandler] Tool usage summary for ${requestId}:`, {
      type,
      provider,
      toolsProvided: tools.length,
      toolCallsMade: toolCalls.length,
      toolsUsed: toolCalls.map((tc) => tc.name),
    });
  }

  /**
   * Get tool by name from tools array
   * @param tools - Array of tool definitions
   * @param toolName - Name of tool to find
   * @returns Tool definition or null if not found
   */
  static getToolByName(tools: Tool[], toolName: string): Tool | null {
    return (
      tools.find((tool) => {
        if ('name' in tool) {
          return tool.name === toolName;
        } else if ('function' in tool) {
          return tool.function.name === toolName;
        }
        return false;
      }) || null
    );
  }
}

export default ToolHandler;

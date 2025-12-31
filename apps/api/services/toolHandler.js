/**
 * Centralized Tool Handler Service
 * Manages tool validation, processing, and provider-specific formatting
 */

const MistralWebSearchService = require('./mistralWebSearchService');

class ToolHandler {
  /**
   * Validate tools array
   * Supports both Claude/Bedrock format and OpenAI/Mistral format
   * @param {Array} tools - Array of tool definitions
   * @returns {boolean} - True if tools are valid
   */
  static validateTools(tools) {
    if (!Array.isArray(tools)) {
      console.warn('[ToolHandler] Tools must be an array');
      return false;
    }

    for (const tool of tools) {
      const isOpenAIFormat = tool.type === 'function' && tool.function;

      if (isOpenAIFormat) {
        const func = tool.function;

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
        if (!tool.name || typeof tool.name !== 'string') {
          console.warn('[ToolHandler] Tool missing valid name (Claude format):', tool);
          return false;
        }

        if (!tool.description || typeof tool.description !== 'string') {
          console.warn('[ToolHandler] Tool missing valid description (Claude format):', tool);
          return false;
        }

        if (!tool.input_schema || typeof tool.input_schema !== 'object') {
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
   * @param {Array} tools - Array of tool definitions (Claude or OpenAI format)
   * @param {string} provider - Provider name ('claude', 'bedrock', 'openai', 'mistral')
   * @returns {Array} - Formatted tools for the provider
   */
  static formatToolsForProvider(tools, provider = 'bedrock') {
    if (!this.validateTools(tools)) {
      throw new Error('Invalid tools provided to formatToolsForProvider');
    }

    const targetProvider = provider.toLowerCase();
    const isClaudeProvider = targetProvider === 'bedrock' || targetProvider === 'claude';
    const isOpenAIProvider = ['openai', 'litellm', 'ionos', 'mistral'].includes(targetProvider);

    return tools.map(tool => {
      const isOpenAIFormat = tool.type === 'function' && tool.function;

      if (isClaudeProvider) {
        if (isOpenAIFormat) {
          return {
            name: tool.function.name,
            description: tool.function.description,
            input_schema: tool.function.parameters
          };
        } else {
          return {
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema
          };
        }
      } else if (isOpenAIProvider) {
        if (isOpenAIFormat) {
          return tool;
        } else {
          return {
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.input_schema
            }
          };
        }
      } else {
        console.warn(`[ToolHandler] Unknown provider: ${provider}, returning tools as-is`);
        return tool;
      }
    });
  }

  /**
   * Validate tool calls from AI response
   * @param {Array} toolCalls - Array of tool calls from AI
   * @param {Array} availableTools - Array of available tool definitions
   * @returns {boolean} - True if all tool calls are valid
   */
  static validateToolCalls(toolCalls, availableTools) {
    if (!Array.isArray(toolCalls)) {
      return false;
    }

    const availableToolNames = availableTools.map(t => t.name);

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
   * @param {Object} options - Request options
   * @param {string} requestId - Request ID for logging
   * @param {string} type - Request type for logging
   * @returns {Array|null} - Validated tools array or null if no tools
   */
  static extractAndValidateTools(options, requestId, type) {
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
   * @param {Object} options - Request options
   * @param {string} provider - Provider name
   * @param {string} requestId - Request ID for logging
   * @param {string} type - Request type for logging
   * @returns {Object} - Tool payload object with tools and tool_choice if applicable
   */
  static prepareToolsPayload(options, provider, requestId, type) {
    const tools = this.extractAndValidateTools(options, requestId, type);
    
    if (!tools) {
      return {};
    }

    const payload = {
      tools: this.formatToolsForProvider(tools, provider)
    };

    // Add tool_choice if specified (mainly for Bedrock/Claude)
    if (options.tool_choice && (provider === 'bedrock' || provider === 'claude')) {
      payload.tool_choice = options.tool_choice;
      console.log(`[ToolHandler] Tool choice added for ${requestId}:`, options.tool_choice);
    }

    return payload;
  }

  /**
   * Log tool usage statistics
   * @param {string} requestId - Request ID
   * @param {string} type - Request type
   * @param {string} provider - Provider used
   * @param {Array} tools - Tools provided
   * @param {Array} toolCalls - Tool calls made by AI
   */
  static logToolUsage(requestId, type, provider, tools = [], toolCalls = []) {
    console.log(`[ToolHandler] Tool usage summary for ${requestId}:`, {
      type,
      provider,
      toolsProvided: tools.length,
      toolCallsMade: toolCalls.length,
      toolsUsed: toolCalls.map(tc => tc.name)
    });
  }

  /**
   * Get tool by name from tools array
   * @param {Array} tools - Array of tool definitions
   * @param {string} toolName - Name of tool to find
   * @returns {Object|null} - Tool definition or null if not found
   */
  static getToolByName(tools, toolName) {
    return tools.find(tool => tool.name === toolName) || null;
  }

  /**
   * Continue conversation after tool_use response
   * Handles tool execution and conversation continuation for web search
   * @param {Object} aiWorkerPool - AI Worker Pool instance
   * @param {Object} initialResult - Initial AI response with tool_use
   * @param {string} systemPrompt - System prompt for continuation
   * @param {Array} messages - Conversation messages
   * @param {Object} options - Request options
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} Final AI response with content
   */
  static async continueWithToolUse(aiWorkerPool, initialResult, systemPrompt, messages, options, req) {
    console.log(`[ToolHandler] Continuing conversation with tool_use response`);
    
    if (!initialResult.tool_calls || initialResult.tool_calls.length === 0) {
      throw new Error('No tool calls found in initial result');
    }

    // Clone messages array to avoid modifying original
    const conversationMessages = [...messages];
    
    // Add the assistant's tool_use message
    conversationMessages.push({
      role: "assistant",
      content: initialResult.raw_content_blocks || [
        ...(initialResult.content ? [{ type: "text", text: initialResult.content }] : []),
        ...initialResult.tool_calls.map(toolCall => ({
          type: "tool_use",
          id: toolCall.id,
          name: toolCall.name,
          input: toolCall.input
        }))
      ]
    });

    // Process each tool call and add tool results
    for (const toolCall of initialResult.tool_calls) {
      console.log(`[ToolHandler] Processing tool call: ${toolCall.name}`, toolCall.input);
      
      let toolResult;
      
      if (toolCall.name === 'web_search') {
        // Use Mistral Web Search Service for real search results
        console.log(`[ToolHandler] Starting real web search for query: "${toolCall.input.query}"`);
        
        const searchService = new MistralWebSearchService();
        toolResult = await searchService.performWebSearch(toolCall.input.query);
        
        console.log(`[ToolHandler] Web search completed: ${toolResult.resultCount} results found`);
        console.log(`[ToolHandler] Search results:`, JSON.stringify(toolResult, null, 2));
      } else {
        // Handle other tools here in the future
        toolResult = {
          success: false,
          error: `Tool ${toolCall.name} is not yet implemented`
        };
        console.log(`[ToolHandler] Unknown tool: ${toolCall.name}`);
      }

      // Add tool result message
      conversationMessages.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: toolCall.id,
          content: JSON.stringify(toolResult)
        }]
      });
    }

    // Continue conversation with updated messages
    console.log(`[ToolHandler] Continuing conversation with ${conversationMessages.length} messages`);
    
    const continuationPayload = {
      systemPrompt,
      messages: conversationMessages,
      options: {
        ...options,
        // Remove tools from continuation to prevent infinite loop
        tools: undefined
      }
    };

    // Get the request type from options or default to 'social'
    const requestType = options.type || 'social';

    // Continue conversation through AI Worker Pool
    const finalResult = await aiWorkerPool.processRequest({
      type: requestType,
      ...continuationPayload
    }, req);

    console.log(`[ToolHandler] Tool continuation completed`);
    
    if (!finalResult.success) {
      throw new Error(finalResult.error || 'Failed to continue conversation after tool use');
    }

    // Return the final result with tool usage metadata
    return {
      ...finalResult,
      metadata: {
        ...finalResult.metadata,
        toolsUsed: initialResult.tool_calls.map(tc => tc.name),
        continuationCompleted: true
      }
    };
  }
}

module.exports = ToolHandler;
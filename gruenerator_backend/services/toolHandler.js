/**
 * Centralized Tool Handler Service
 * Manages tool validation, processing, and provider-specific formatting
 */

class ToolHandler {
  /**
   * Validate tools array
   * @param {Array} tools - Array of tool definitions
   * @returns {boolean} - True if tools are valid
   */
  static validateTools(tools) {
    if (!Array.isArray(tools)) {
      console.warn('[ToolHandler] Tools must be an array');
      return false;
    }

    for (const tool of tools) {
      if (!tool.name || typeof tool.name !== 'string') {
        console.warn('[ToolHandler] Tool missing valid name:', tool);
        return false;
      }
      
      if (!tool.description || typeof tool.description !== 'string') {
        console.warn('[ToolHandler] Tool missing valid description:', tool);
        return false;
      }
      
      if (!tool.input_schema || typeof tool.input_schema !== 'object') {
        console.warn('[ToolHandler] Tool missing valid input_schema:', tool);
        return false;
      }
    }

    return true;
  }

  /**
   * Format tools for specific AI provider
   * @param {Array} tools - Array of tool definitions
   * @param {string} provider - Provider name ('claude', 'bedrock', 'openai')
   * @returns {Array} - Formatted tools for the provider
   */
  static formatToolsForProvider(tools, provider = 'bedrock') {
    if (!this.validateTools(tools)) {
      throw new Error('Invalid tools provided to formatToolsForProvider');
    }

    switch (provider.toLowerCase()) {
      case 'bedrock':
      case 'claude':
        // Both Bedrock and Claude use the same format
        return tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          input_schema: tool.input_schema
        }));
      
      case 'openai':
      case 'litellm':
      case 'ionos':
        // OpenAI, LiteLLM, and IONOS use the same format
        return tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
          }
        }));
      
      default:
        console.warn(`[ToolHandler] Unknown provider: ${provider}, using default format`);
        return tools;
    }
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
}

module.exports = ToolHandler;
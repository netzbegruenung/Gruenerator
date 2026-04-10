/**
 * Type definitions for Tool Handler Service
 */

/**
 * AI Provider types
 */
export type AIProvider = 'mistral' | 'litellm' | 'ionos' | 'regolo';

/**
 * Claude/Bedrock tool format
 */
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * OpenAI tool format
 */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Union type for any tool format
 */
export type Tool = ClaudeTool | OpenAITool;

/**
 * Tool call from AI response
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Content block for tool use in messages
 */
export interface ToolUseContentBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/**
 * Content block for tool result in messages
 */
export interface ToolResultContentBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

/**
 * Text content block
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

/**
 * Union of all content block types
 */
export type ContentBlock = ToolUseContentBlock | ToolResultContentBlock | TextContentBlock;

/**
 * Message with content blocks
 */
export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: ContentBlock[] | string;
}

/**
 * Tool choice option
 */
export type ToolChoice = 'auto' | 'required' | { type: 'tool'; name: string };

/**
 * Tool payload for API requests
 */
export interface ToolPayload {
  tools?: Tool[] | undefined;
  tool_choice?: ToolChoice | undefined;
}

/**
 * Web search tool result
 */
export interface WebSearchResult {
  success: boolean;
  resultCount?: number | undefined;
  results?: Record<string, unknown>[] | undefined;
  error?: string | undefined;
}

/**
 * Tool usage metadata
 */
export interface ToolUsageMetadata {
  toolsUsed: string[];
  continuationCompleted: boolean;
}

/**
 * AI response with tool metadata
 */
export interface AIResponseWithTools {
  success: boolean;
  content?: string | undefined;
  raw_content_blocks?: ContentBlock[] | undefined;
  tool_calls?: ToolCall[] | undefined;
  error?: string | undefined;
  metadata?: ToolUsageMetadata & Record<string, unknown> | undefined;
}

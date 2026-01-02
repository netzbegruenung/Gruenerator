import { Anthropic } from '@anthropic-ai/sdk';
import ToolHandler from '../../services/tools/index.js';
import config from '../worker.config.js';
import { mergeMetadata } from './adapterUtils.js';
import * as typeProfiles from '../../config/typeProfiles.js';

const anthropic = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

async function execute(requestId, data) {
  const { prompt, systemPrompt, messages, options = {}, type, metadata: requestMetadata = {}, fileMetadata } = data;

  const { useBedrock, betas, ...apiOptions } = options;

  const defaultConfig = {
    model: 'claude-3-7-sonnet-latest',
    max_tokens: 8000,
    temperature: 0.7
  };

  const typeConfig = typeProfiles.getTypeProfile(type);

  let requestConfig = {
    ...defaultConfig,
    ...(typeConfig || {}),
    ...apiOptions,
    system: systemPrompt || (typeConfig?.system || defaultConfig.system)
  };

  const headers = {};

  if (messages) {
    requestConfig.messages = messages;
  } else if (prompt) {
    requestConfig.messages = [{ role: 'user', content: prompt }];
  }

  const toolsPayload = ToolHandler.prepareToolsPayload(apiOptions, 'claude', requestId, type);
  if (toolsPayload.tools) {
    requestConfig.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) requestConfig.tool_choice = toolsPayload.tool_choice;
  }

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Request Timeout nach ${config.worker.requestTimeout/1000} Sekunden`)), config.worker.requestTimeout);
  });

  const response = await Promise.race([
    anthropic.messages.create(requestConfig, { headers }),
    timeoutPromise
  ]);

  if (!response.content || !response.content[0] || !response.content[0].text) {
    if (response.stop_reason !== 'tool_use' && (!response.content || !response.content[0] || typeof response.content[0].text !== 'string')) {
      throw new Error(`Invalid Claude response for request ${requestId}: missing textual content when not using tools`);
    }
    if (response.stop_reason === 'tool_use' && (!response.tool_calls || response.tool_calls.length === 0)) {
      throw new Error(`Invalid Claude response for request ${requestId}: tool_use indicated but no tool_calls provided.`);
    }
  }

  const textualContent = response.content?.find(block => block.type === 'text')?.text || null;

  return {
    content: textualContent,
    stop_reason: response.stop_reason,
    tool_calls: response.tool_calls,
    raw_content_blocks: response.content,
    success: true,
    metadata: mergeMetadata(requestMetadata, {
      provider: 'claude',
      timestamp: new Date().toISOString(),
      backupRequested: false,
      requestId,
      messageId: response.id,
      isFilesApiRequest: fileMetadata?.fileId ? true : false,
      fileId: fileMetadata?.fileId || null,
      usedPromptCaching: fileMetadata?.usePromptCaching || false,
      modelUsed: requestConfig.model
    })
  };
}

export { execute };
import { InvokeModelCommand, InvokeModelCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import bedrockClient from '../awsBedrockClient.js';
import ToolHandler from '../../services/tools/index.js';
import config from '../worker.config.js';
import { mergeMetadata } from './adapterUtils.js';
import type { AIRequestData, AIWorkerResult, ToolCall, ContentBlock } from '../types.js';

interface BedrockPayload {
  anthropic_version: string;
  max_tokens: number;
  messages: Array<{ role: string; content: unknown }>;
  temperature?: number;
  top_p?: number;
  system?: string;
  tools?: unknown[];
  tool_choice?: unknown;
}

interface BedrockResponseBody {
  content?: Array<{ type: string; text?: string }> | string;
  output_text?: Array<{ type: string; text?: string }> | string;
  tool_calls?: ToolCall[];
  stop_reason?: string;
}

async function execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { messages, systemPrompt, options = {}, type, tools, metadata: requestMetadata = {} } = data;

  const modelIdentifier = options.model || 'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-sonnet-4-5-20250929-v1:0';
  const startTime = Date.now();

  if (!modelIdentifier) throw new Error('No model identifier provided in options.');
  if (!messages || messages.length === 0) throw new Error('Messages are required for Bedrock request.');

  const bedrockPayload: BedrockPayload = {
    anthropic_version: options.anthropic_version || 'bedrock-2023-05-31',
    max_tokens: options.max_tokens || 4096,
    messages: messages as Array<{ role: string; content: unknown }>
  };

  if (options.top_p !== undefined) {
    bedrockPayload.top_p = options.top_p;
  } else {
    bedrockPayload.temperature = options.temperature !== undefined ? options.temperature : 0.7;
  }
  if (systemPrompt) bedrockPayload.system = systemPrompt;

  const toolsToUse = options.tools || tools;
  if (toolsToUse && toolsToUse.length > 0) options.tools = toolsToUse;
  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'bedrock', requestId, type);
  if (toolsPayload.tools) {
    bedrockPayload.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) bedrockPayload.tool_choice = toolsPayload.tool_choice;
  }

  const baseCommand = (modelId: string) => new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(bedrockPayload)
  });

  let retryCount = 0;
  const maxRetries = 1;
  let response: InvokeModelCommandOutput | undefined;
  const bedrockModelHierarchy = [
    'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-sonnet-4-20250514-v1:0',
    'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-3-7-sonnet-20250219-v1:0',
    'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-3-5-sonnet-20240620-v1:0'
  ];

  const modelsToTry = [modelIdentifier];
  bedrockModelHierarchy.forEach(model => {
    if (model !== modelIdentifier && !modelsToTry.includes(model)) {
      modelsToTry.push(model);
    }
  });

  let modelIndex = 0;
  let currentModelId = modelsToTry[modelIndex];

  while (modelIndex < modelsToTry.length) {
    try {
      response = await bedrockClient.send(baseCommand(currentModelId));
      break;
    } catch (error: unknown) {
      const err = error as { name?: string; $metadata?: { httpStatusCode?: number }; message?: string };
      if (err.name === 'ThrottlingException' && retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`[Bedrock ${requestId}] Throttled on ${currentModelId}, retrying after ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        retryCount++;
        continue;
      }
      if ((err.$metadata?.httpStatusCode || 0) >= 500 && retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`[Bedrock ${requestId}] Server error on ${currentModelId}, retrying after ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        retryCount++;
        continue;
      }

      if ((err.name === 'ThrottlingException' || (err.$metadata?.httpStatusCode || 0) >= 500) && modelIndex + 1 < modelsToTry.length) {
        console.log(`[Bedrock ${requestId}] Max retries exhausted for ${currentModelId}, switching to next model`);
        modelIndex++;
        currentModelId = modelsToTry[modelIndex];
        retryCount = 0;
        console.log(`[Bedrock ${requestId}] Trying fallback model: ${currentModelId}`);
        continue;
      }

      throw error;
    }
  }

  const duration = Date.now() - startTime;
  let responseBody: BedrockResponseBody;
  try {
    const text = new TextDecoder('utf-8').decode(response!.body);
    responseBody = JSON.parse(text);
  } catch {
    responseBody = response!.body as unknown as BedrockResponseBody;
  }

  if (!responseBody) throw new Error('Empty response from Bedrock');

  const contentBlocks = responseBody.content || responseBody.output_text || [];
  let contentText: string | null = null;
  if (Array.isArray(contentBlocks)) {
    const firstText = contentBlocks.find(b => b.type === 'text');
    contentText = firstText?.text || null;
  } else if (typeof contentBlocks === 'string') {
    contentText = contentBlocks;
  }

  const toolCalls = responseBody.tool_calls || [];
  const stopReason = responseBody.stop_reason || 'stop';

  const rawContentBlocks: ContentBlock[] = Array.isArray(contentBlocks)
    ? contentBlocks
    : (contentText ? [{ type: 'text', text: contentText }] : []);

  return {
    content: contentText,
    stop_reason: stopReason,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    raw_content_blocks: rawContentBlocks,
    success: true,
    metadata: mergeMetadata(requestMetadata, {
      provider: 'bedrock',
      model: currentModelId,
      timestamp: new Date().toISOString(),
      requestId,
      durationMs: duration
    })
  };
}

export { execute };

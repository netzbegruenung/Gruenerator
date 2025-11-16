const { InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const bedrockClient = require('../awsBedrockClient');
const ToolHandler = require('../../services/toolHandler');
const config = require('../worker.config');
const { mergeMetadata } = require('./adapterUtils');

async function execute(requestId, data) {
  const { messages, systemPrompt, options = {}, type, tools, metadata: requestMetadata = {} } = data;

  const modelIdentifier = options.model || 'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-sonnet-4-5-20250929-v1:0';
  const startTime = Date.now();

  if (!modelIdentifier) throw new Error('No model identifier provided in options.');
  if (!messages || messages.length === 0) throw new Error('Messages are required for Bedrock request.');

  const bedrockPayload = {
    anthropic_version: options.anthropic_version || 'bedrock-2023-05-31',
    max_tokens: options.max_tokens || 4096,
    messages,
    temperature: options.temperature !== undefined ? options.temperature : 0.7
  };

  if (options.top_p !== undefined) {
    bedrockPayload.top_p = options.top_p;
  }
  if (systemPrompt) bedrockPayload.system = systemPrompt;

  const toolsToUse = options.tools || tools;
  if (toolsToUse && toolsToUse.length > 0) options.tools = toolsToUse;
  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'bedrock', requestId, type);
  if (toolsPayload.tools) {
    bedrockPayload.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) bedrockPayload.tool_choice = toolsPayload.tool_choice;
  }

  const baseCommand = (modelId) => new InvokeModelCommand({
    modelId,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(bedrockPayload)
  });

  let retryCount = 0;
  const maxRetries = 1;
  let response;
  const bedrockModelHierarchy = [
    'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
    'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-sonnet-4-20250514-v1:0',
    'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-3-7-sonnet-20250219-v1:0',
    'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-3-5-sonnet-20240620-v1:0'
  ];

  // Build unique models list - start with requested model, then add remaining from hierarchy
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
    } catch (error) {
      if (error.name === 'ThrottlingException' && retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`[Bedrock ${requestId}] Throttled on ${currentModelId}, retrying after ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        retryCount++;
        continue;
      }
      if ((error.$metadata?.httpStatusCode || 0) >= 500 && retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`[Bedrock ${requestId}] Server error on ${currentModelId}, retrying after ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        retryCount++;
        continue;
      }

      // If throttled or server error and max retries exhausted, try next model
      if ((error.name === 'ThrottlingException' || (error.$metadata?.httpStatusCode || 0) >= 500) && modelIndex + 1 < modelsToTry.length) {
        console.log(`[Bedrock ${requestId}] Max retries exhausted for ${currentModelId}, switching to next model`);
        modelIndex++;
        currentModelId = modelsToTry[modelIndex];
        retryCount = 0; // Reset retry count for new model
        console.log(`[Bedrock ${requestId}] Trying fallback model: ${currentModelId}`);
        continue;
      }

      // If all models exhausted or other error type, throw the error
      throw error;
    }
  }

  const duration = Date.now() - startTime;
  let responseBody;
  try {
    const text = new TextDecoder('utf-8').decode(response.body);
    responseBody = JSON.parse(text);
  } catch (e) {
    // Some SDKs return already-parsed
    responseBody = response.body;
  }

  if (!responseBody) throw new Error('Empty response from Bedrock');

  const contentBlocks = responseBody.content || responseBody.output_text || [];
  let contentText = null;
  if (Array.isArray(contentBlocks)) {
    const firstText = contentBlocks.find(b => b.type === 'text');
    contentText = firstText?.text || null;
  } else if (typeof contentBlocks === 'string') {
    contentText = contentBlocks;
  }

  const toolCalls = responseBody.tool_calls || [];
  const stopReason = responseBody.stop_reason || 'stop';

  return {
    content: contentText,
    stop_reason: stopReason,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    raw_content_blocks: Array.isArray(contentBlocks) ? contentBlocks : (contentText ? [{ type: 'text', text: contentText }] : []),
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

module.exports = { execute };


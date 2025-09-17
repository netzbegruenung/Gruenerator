const { parentPort } = require('worker_threads');
const providerSelector = require('../services/providerSelector');
const providerFallback = require('../services/providerFallback');
const providers = require('./providers');
require('dotenv').config();

// Logging controls
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const isDebug = LOG_LEVEL === 'debug';
const isVerbose = ['debug', 'verbose'].includes(LOG_LEVEL);

// (API clients are owned by provider adapters)

// Process incoming messages with new message protocol
parentPort.on('message', async (message) => {
  const { type, requestId, data } = message;
  
  if (type !== 'request') {
    console.warn(`[AI Worker] Received unknown message type: ${type}`);
    return;
  }
  
  console.log(`[AI Worker] Processing request ${requestId} of type ${data.type}`);
  
  try {
    // Send progress update at 10%
    sendProgress(requestId, 10);
    
    // Process the request
    const result = await processAIRequest(requestId, data);
    
    // Validate result before sending - handle both text and tool responses
    
    if (!result || (!result.content && result.stop_reason !== 'tool_use')) {
      throw new Error(`Empty or invalid result generated for request ${requestId}`);
    }
    
    // For tool_use responses, ensure we have tool_calls
    if (result.stop_reason === 'tool_use' && (!result.tool_calls || result.tool_calls.length === 0)) {
      throw new Error(`Tool use indicated but no tool calls found for request ${requestId}`);
    }
    
    // Send back the successful result
    parentPort.postMessage({
      type: 'response',
      requestId,
      data: result
    });
    
  } catch (error) {
    console.error(`[AI Worker] Error processing request ${requestId}:`, error);
    
    // Send back the error
    parentPort.postMessage({
      type: 'error',
      requestId,
      error: error.message || 'Unknown error'
    });
  }
});

// Helper function to send progress updates (disabled for cleaner logs)
function sendProgress(requestId, progress) {
  // Progress updates disabled to reduce log noise
  // Only enable for debugging if needed
  return;
}

// (metadata merge and provider override logic moved to adapters/providerSelector)

/**
 * Determine provider from model name
 * @param {string} modelName - The model identifier
 * @returns {string} Provider name
 */
// (model→provider resolution moved to providerSelector)

/**
 * Privacy mode fallback system - tries privacy-friendly providers in sequence
 * @param {string} requestId - Request identifier
 * @param {Object} data - Request data
 * @returns {Promise<Object>} AI response result
 */
// (privacy fallback moved to services/providerFallback)

// Main AI request processing function
async function processAIRequest(requestId, data) {
  // Destructure data, ensuring options exists and preserve original metadata
  const { type, prompt, options = {}, systemPrompt, messages, metadata: requestMetadata = {} } = data;

  // Provider selection delegated to selector (preserves legacy behavior)
  console.log(`[AI Worker] Request ${requestId} - useBedrock in data: ${data.useBedrock}, in options: ${options.useBedrock}`);
  const selection = providerSelector.selectProviderAndModel({
    type,
    options,
    metadata: requestMetadata,
    env: process.env
  });
  console.log(`[AI Worker] Provider selection for ${requestId}:`, selection);
  let effectiveOptions = { ...options, provider: selection.provider, model: selection.model, useBedrock: !!selection.useBedrock };

  try {
    let result;
    
    // Check for explicit provider override - check both data.provider and options.provider
    // Only treat top-level data.provider as explicit; selection.provider is a default
    const explicitProvider = data.provider || null;
    if (explicitProvider) {
      if (isVerbose) console.log(`[AI Worker] Using ${explicitProvider} for ${requestId}`);
      sendProgress(requestId, 15);
      result = await providers.executeProvider(explicitProvider, requestId, { ...data, options: effectiveOptions });
    }
    
    // Default logic refactor: prefer Mistral by default; use Claude only when explicitly chosen; Bedrock only when enabled by flow/options.
    if (!result && explicitProvider === 'claude') {
      sendProgress(requestId, 15);
      result = await providers.executeProvider('claude', requestId, { ...data, options: effectiveOptions });
    } else if (!result && effectiveOptions.useBedrock === true && !explicitProvider) {
      console.log(`[AI Worker] Using AWS Bedrock provider for ${requestId}`);
      sendProgress(requestId, 15);
      result = await providers.executeProvider('bedrock', requestId, { ...data, options: effectiveOptions });
    } else if (!result && !explicitProvider) {
      console.log(`[AI Worker] Using Mistral provider by default for ${requestId}`);
      sendProgress(requestId, 15);
      result = await providers.executeProvider('mistral', requestId, { ...data, options: effectiveOptions });
    }

    sendProgress(requestId, 100);
    return result;

  } catch (error) {
    console.error(`[AI Worker] Error in processAIRequest for ${requestId}:`, error);
    // Final safety net: try privacy mode providers as backup via helper
    try {
      console.log(`[AI Worker] Main processing failed for ${requestId}, attempting privacy mode fallback`);
      const result = await providerFallback.tryPrivacyModeProviders(async (providerName, privacyData) => {
        return providers.executeProvider(providerName, requestId, privacyData);
      }, requestId, data);
      console.log(`[AI Worker] Privacy mode fallback successful for ${requestId}`);
      return result;
    } catch (privacyError) {
      console.error(`[AI Worker] Privacy mode fallback also failed for ${requestId}:`, privacyError);
      throw error;
    }
  }
}

// (OpenAI direct implementation moved to providers/openaiAdapter.js)
/* async function processWithOpenAI(requestId, data) {
  const { prompt, systemPrompt, messages, type, metadata: requestMetadata = {} } = data;
  
  console.log('[AI Worker] OpenAI Request:', {
    type,
    requestId,
    hasSystemPrompt: !!systemPrompt,
    messageCount: messages?.length || 1,
    model: 'gpt-4o-2024-08-06'
  });
  
  const openAIMessages = [];
  
  // Spezielle Behandlung für Social Media Anfragen
  if (type === 'social') {
    // System Message hinzufügen
    openAIMessages.push({
      role: 'system',
      content: systemPrompt || 'Du bist ein Social Media Manager für Bündnis 90/Die Grünen. Erstelle Vorschläge für Social Media Beiträge für die angegebenen Plattformen und passe den Inhalt sowie den Stil an jede Plattform an. Gib deine Antwort in einem strukturierten JSON-Format zurück.'
    });

    // Konvertiere die komplexen Messages in einfache Textformate für OpenAI
    if (messages) {
      messages.forEach(msg => {
        openAIMessages.push({
          role: msg.role,
          content: Array.isArray(msg.content) 
            ? msg.content.map(c => c.text).join('\n')
            : msg.content
        });
      });
    }
  } else {
    // Standard-Verarbeitung für andere Anfragen
    if (systemPrompt) {
      openAIMessages.push({ role: 'system', content: systemPrompt });
    }
    if (messages) {
      // Simple message structure expected for generator_config
      messages.forEach(msg => {
        openAIMessages.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) // Ensure content is string
        });
      });
    }
  }

  try {
    sendProgress(requestId, 50);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      messages: openAIMessages,
      temperature: 0.7,
      max_tokens: 4000,
      response_format: (type === 'social' || type === 'generator_config') ? { type: "json_object" } : undefined
    });

    // Validate the response
    if (!response.choices || !response.choices[0] || !response.choices[0].message || !response.choices[0].message.content) {
      throw new Error(`Invalid OpenAI response for request ${requestId}`);
    }

    // Strukturierte Response
    return {
      content: response.choices[0].message.content,
      success: true,
      metadata: mergeMetadata(requestMetadata, {
        provider: 'openai',
        timestamp: new Date().toISOString(),
        backupRequested: true,
        type: type,
        requestId
      })
    };
  } catch (error) {
    console.error('[AI Worker] OpenAI Error:', error);
    throw new Error(`OpenAI Error: ${error.message}`);
  }
} */

// Function to process request with AWS Bedrock
// (Bedrock implementation moved to providers/bedrockAdapter.js)
/* async function processWithBedrock(requestId, data) {
  const { messages, systemPrompt, options = {}, type, tools, metadata: requestMetadata = {} } = data;
  // Use model from options if provided (for gruenerator_ask), otherwise hardcoded Claude 4 ARN
  const modelIdentifier = options.model || 'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-sonnet-4-20250514-v1:0';
  
  // Track timing for summary log
  const startTime = Date.now();

  if (!modelIdentifier) {
    throw new Error('No model identifier provided in options.');
  }

  if (!messages || messages.length === 0) {
    throw new Error('Messages are required for Bedrock request.');
  }


  // Construct the payload for Bedrock Claude
  // Note: Bedrock API structure differs from direct Anthropic API
  const bedrockPayload = {
    anthropic_version: options.anthropic_version || "bedrock-2023-05-31", // Required for Bedrock
    max_tokens: options.max_tokens || 4096, // Default or from options
    messages: messages,
    temperature: options.temperature !== undefined ? options.temperature : 0.7,
    top_p: options.top_p !== undefined ? options.top_p : 0.9,
    // top_k: options.top_k, // Optional
    // stop_sequences: options.stop_sequences, // Optional
  };

  if (systemPrompt) {
    bedrockPayload.system = systemPrompt;
  }

  // Add tools support - check both options.tools and top-level tools
  const toolsToUse = options.tools || tools;
  if (toolsToUse && toolsToUse.length > 0) {
    // Store tools in options for ToolHandler
    options.tools = toolsToUse;
  }

  // Add tools support using ToolHandler
  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'bedrock', requestId, type);
  if (toolsPayload.tools) {
    bedrockPayload.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) {
      bedrockPayload.tool_choice = toolsPayload.tool_choice;
    }
  }

  try {
    sendProgress(requestId, 20);


    const command = new InvokeModelCommand({
      modelId: modelIdentifier, // Use ARN or ID
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(bedrockPayload),
    });

    
    // Add retry logic with EU model hierarchy fallback
    let retryCount = 0;
    const maxRetries = 3;
    let response;
    
    // Bedrock model hierarchy for fallbacks (ARN format for EU region)
    const bedrockModelHierarchy = [
      'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-sonnet-4-20250514-v1:0',      // Claude 4 - Primary
      'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-3-7-sonnet-20250219-v1:0',   // Claude 3.7 - First fallback
      'arn:aws:bedrock:eu-central-1:481665093592:inference-profile/eu.anthropic.claude-3-5-sonnet-20240620-v1:0'    // Claude 3.5 - Second fallback
    ];
    
    // Start with the provided model, then fallback to hierarchy
    const modelsToTry = [modelIdentifier, ...bedrockModelHierarchy.filter(m => m !== modelIdentifier)];
    
    
    let modelIndex = 0;
    let currentModelId = modelsToTry[modelIndex];
    
    while (retryCount <= maxRetries && modelIndex < modelsToTry.length) {
      try {
        const currentCommand = new InvokeModelCommand({
          modelId: currentModelId,
          contentType: "application/json",
          accept: "application/json",
          body: JSON.stringify(bedrockPayload),
        });
        
        response = await bedrockClient.send(currentCommand);
        break; // Success, exit retry loop
      } catch (error) {
        if (error.name === 'ThrottlingException' && retryCount < maxRetries) {
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
          console.log(`[AI Worker] Rate limited on ${currentModelId}, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          retryCount++;
        } else if ((error.name === 'ThrottlingException' || error.name === 'ModelNotReadyException') && modelIndex < modelsToTry.length - 1) {
          // Move to next model in hierarchy
          modelIndex++;
          currentModelId = modelsToTry[modelIndex];
          retryCount = 0; // Reset retry count for new model
          console.log(`[AI Worker] Fallback to model ${modelIndex + 1}: ${currentModelId.split('/').pop()}`);
        } else {
          // No more Bedrock models to try - attempt privacy mode fallback
          console.log(`[AI Worker] All Bedrock models failed for ${requestId}, falling back to privacy mode providers`);
          try {
            return await tryPrivacyModeProviders(requestId, data);
          } catch (privacyError) {
            console.error(`[AI Worker] Privacy mode fallback also failed for ${requestId}. Privacy error:`, privacyError.message);
            throw new Error(`All providers failed. Bedrock: ${error.message}, Privacy providers: ${privacyError.message}`);
          }
        }
      }
    }
    
    sendProgress(requestId, 90);

    // Decode the response body (Uint8Array to JSON string, then parse)
    const jsonString = new TextDecoder().decode(response.body);
    // Log the raw response string from Bedrock before parsing
    console.log(`[AI Worker] Raw Bedrock response string for ${requestId}:`, jsonString);
    const parsedResponse = JSON.parse(jsonString);

    // Validate response structure - handle both text and tool_use responses
    if (!parsedResponse.content || !Array.isArray(parsedResponse.content) || parsedResponse.content.length === 0) {
      console.error("[AI Worker] Invalid Bedrock response structure:", parsedResponse);
      throw new Error(`Invalid Bedrock response structure for request ${requestId}.`);
    }

    // Extract text content and tool calls
    const textBlock = parsedResponse.content.find(block => block.type === 'text');
    const toolBlocks = parsedResponse.content.filter(block => block.type === 'tool_use');
    
    const responseText = textBlock?.text || null;
    const toolCalls = toolBlocks.map(block => ({
      id: block.id,
      name: block.name,
      input: block.input
    }));

    // Single summary log
    const duration = Date.now() - startTime;
    const modelName = currentModelId.split('/').pop() || currentModelId;
    console.log(`[AI Worker] Request ${requestId}: ${type} → ${modelName} (${duration}ms)`);

    return {
      content: responseText,
      stop_reason: parsedResponse.stop_reason,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      raw_content_blocks: parsedResponse.content,
      success: true,
      metadata: mergeMetadata(requestMetadata, {
        provider: 'aws-bedrock',
        model: currentModelId, // Use the actual model that succeeded
        originalModel: modelIdentifier, // Keep track of the originally requested model
        timestamp: new Date().toISOString(),
        requestId: requestId
      })
    };

  } catch (error) {
    console.error(`[AI Worker] AWS Bedrock Error for request ${requestId}:`, error);
    // Distinguish SDK/AWS errors from application logic errors if possible
    throw new Error(`AWS Bedrock Error: ${error.message || 'Unknown error during Bedrock API call'}`);
  }
} */

// Function to process request with LiteLLM
// (LiteLLM implementation moved to providers/litellmAdapter.js)
/* async function processWithLiteLLM(requestId, data) {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;
  
  // LiteLLM configuration
  const litellmApiKey = process.env.LITELLM_API_KEY;
  const model = options.model || 'llama3.3';
  
  if (!litellmApiKey) {
    throw new Error('LITELLM_API_KEY environment variable is required for LiteLLM requests');
  }

  console.log(`[AI Worker] Processing with LiteLLM. Request ID: ${requestId}, Type: ${type}, Model: ${model}`);

  // Create LiteLLM client using OpenAI SDK with custom base URL
  const litellmClient = new OpenAI({
    apiKey: litellmApiKey,
    baseURL: 'https://litellm.netzbegruenung.verdigado.net'
  });

  // Format messages for OpenAI compatible format
  const litellmMessages = [];
  
  if (systemPrompt) {
    litellmMessages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  if (messages) {
    messages.forEach(msg => {
      litellmMessages.push({
        role: msg.role,
        content: typeof msg.content === 'string' 
          ? msg.content 
          : Array.isArray(msg.content) 
            ? msg.content.map(c => c.text || c.content || '').join('\n')
            : String(msg.content)
      });
    });
  }

  // LiteLLM configuration - match OpenAI chat completions format
  const litellmConfig = {
    model: model,
    messages: litellmMessages,
    max_tokens: options.max_tokens || 4096,
    temperature: options.temperature || 0.7,
    top_p: options.top_p || 1.0,
    stream: false
  };

  // Add tools support using ToolHandler
  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'litellm', requestId, type);
  if (toolsPayload.tools) {
    litellmConfig.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) {
      litellmConfig.tool_choice = toolsPayload.tool_choice;
    }
  }

  try {
    sendProgress(requestId, 30);

    console.log(`[AI Worker] Sending LiteLLM request for ${requestId}`);
    
    const response = await litellmClient.chat.completions.create(litellmConfig);
    
    sendProgress(requestId, 90);

    // Extract response content
    const responseContent = response.choices[0]?.message?.content || null;
    const toolCalls = response.choices[0]?.message?.tool_calls || [];
    const stopReason = response.choices[0]?.finish_reason || 'stop';

    console.log(`[AI Worker] LiteLLM response received for ${requestId}:`, {
      contentLength: responseContent?.length || 0,
      stopReason: stopReason,
      toolCallCount: toolCalls.length,
      model: response.model || model
    });

    return {
      content: responseContent,
      stop_reason: stopReason,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      raw_content_blocks: [{ type: 'text', text: responseContent }],
      success: true,
      metadata: mergeMetadata(requestMetadata, {
        provider: 'litellm',
        model: response.model || model,
        timestamp: new Date().toISOString(),
        requestId: requestId,
        usage: response.usage
      })
    };

  } catch (error) {
    console.error(`[AI Worker] LiteLLM Error for request ${requestId}:`, error);
    throw new Error(`LiteLLM Error: ${error.message || 'Unknown error during LiteLLM API call'}`);
  }
} */

// Function to process request with IONOS
// (IONOS implementation moved to providers/ionosAdapter.js)
/* async function processWithIONOS(requestId, data) {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;
  
  // IONOS configuration
  const ionosApiToken = process.env.IONOS_API_TOKEN;
  const model = options.model || 'meta-llama/Llama-3.3-70B-Instruct';
  
  if (!ionosApiToken) {
    throw new Error('IONOS_API_TOKEN environment variable is required for IONOS requests');
  }

  console.log(`[AI Worker] Processing with IONOS. Request ID: ${requestId}, Type: ${type}, Model: ${model}`);

  // Create IONOS client using OpenAI SDK with custom base URL
  const ionosClient = new OpenAI({
    apiKey: ionosApiToken,
    baseURL: 'https://openai.inference.de-txl.ionos.com/v1'
  });

  // Format messages for OpenAI compatible format
  const ionosMessages = [];
  
  if (systemPrompt) {
    ionosMessages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  if (messages) {
    messages.forEach(msg => {
      ionosMessages.push({
        role: msg.role,
        content: typeof msg.content === 'string' 
          ? msg.content 
          : Array.isArray(msg.content) 
            ? msg.content.map(c => c.text || c.content || '').join('\n')
            : String(msg.content)
      });
    });
  }

  // IONOS configuration - match Python example parameters
  const ionosConfig = {
    model: model,
    messages: ionosMessages,
    max_tokens: options.max_tokens || 4096, // Match other providers for consistent output
    temperature: options.temperature || 0,
    top_p: options.top_p || 0.1,
    stream: false // Disable streaming for Llama models
  };

  // Add tools support using ToolHandler
  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'ionos', requestId, type);
  if (toolsPayload.tools) {
    ionosConfig.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) {
      ionosConfig.tool_choice = toolsPayload.tool_choice;
    }
  }

  try {
    sendProgress(requestId, 30);

    console.log(`[AI Worker] Sending IONOS request for ${requestId}`);
    
    const response = await ionosClient.chat.completions.create(ionosConfig);
    
    sendProgress(requestId, 90);

    // Extract response content
    const responseContent = response.choices[0]?.message?.content || null;
    const toolCalls = response.choices[0]?.message?.tool_calls || [];
    const stopReason = response.choices[0]?.finish_reason || 'stop';

    console.log(`[AI Worker] IONOS response received for ${requestId}:`, {
      contentLength: responseContent?.length || 0,
      stopReason: stopReason,
      toolCallCount: toolCalls.length,
      model: response.model || model
    });

    return {
      content: responseContent,
      stop_reason: stopReason,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      raw_content_blocks: [{ type: 'text', text: responseContent }],
      success: true,
      metadata: mergeMetadata(requestMetadata, {
        provider: 'ionos',
        model: response.model || model,
        timestamp: new Date().toISOString(),
        requestId: requestId,
        usage: response.usage
      })
    };

  } catch (error) {
    console.error(`[AI Worker] IONOS Error for request ${requestId}:`, error);
    throw new Error(`IONOS Error: ${error.message || 'Unknown error during IONOS API call'}`);
  }
} */

// Function to process request with Mistral
// (Mistral implementation moved to providers/mistralAdapter.js)
/* async function processWithMistral(requestId, data) {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;
  
  // Mistral configuration
  const model = options.model || 'mistral-medium-latest';
  
  // Type-specific temperature for better instruction following (can be overridden by options.temperature)
  const mistralTemperatures = {
    'social': 0.3,      // Social media needs some creativity but must follow format
    'presse': 0.3,      // Press releases need precision
    'antrag': 0.2,      // Proposals need exact formatting
    'web_search_summary': 0.2, // Strict instruction following for length and citation format
    'crawler_agent': 0.1, // Very low temperature for consistent URL selection decisions
    'generator_config': 0.1, // Strongly bias toward strict JSON format
    'default': 0.35
  };
  const temperature = (typeof options.temperature === 'number')
    ? options.temperature
    : (mistralTemperatures[type] || mistralTemperatures.default);
  
  if (!mistralClient) {
    throw new Error('Mistral client not available. Check MISTRAL_API_KEY environment variable.');
  }

  const maxTokens = options.max_tokens || 4096;
  console.log(`[AI Worker] Mistral: id=${requestId}, type=${type}, model=${model}, temp=${temperature}, tokens=${maxTokens}`);

  // Format messages for Mistral API
  const mistralMessages = [];
  
  if (systemPrompt) {
    mistralMessages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  if (messages) {
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        // DEEP DEBUG: Log incoming message structure
        if (isDebug) {
          console.log(`[AI Worker DEBUG] Assistant msg for ${requestId}`);
          console.log(`[AI Worker DEBUG] msg.content:`, JSON.stringify(msg.content, null, 2));
        }
        
        // Check for tool_use blocks
        const toolUseBlocks = msg.content.filter(c => c.type === 'tool_use');
        if (isDebug) console.log(`[AI Worker DEBUG] tool_use blocks: ${toolUseBlocks.length}`, JSON.stringify(toolUseBlocks, null, 2));
        
        const toolCalls = toolUseBlocks.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input)
            }
          }));
        
        if (isDebug) console.log(`[AI Worker DEBUG] tool_calls: ${toolCalls.length}`, JSON.stringify(toolCalls, null, 2));
        
        // Validate tool calls are properly formatted
        if (toolCalls.length > 0 && !toolCalls[0].function) {
          console.error(`[AI Worker] Invalid tool call format for ${requestId}:`, toolCalls);
        }
        
        const textContent = msg.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        
        if (toolCalls.length > 0) {
          // Assistant message with tool calls (provide both snake_case and camelCase for SDK compatibility)
          const assistantMessage = {
            role: 'assistant',
            // Some SDKs reject explicit empty string; omit if empty
            ...(textContent && textContent.trim().length > 0 ? { content: textContent } : {}),
            tool_calls: toolCalls,
            toolCalls: toolCalls
          };
          if (isDebug) console.log(`[AI Worker DEBUG] Assistant with tool_calls:`, JSON.stringify(assistantMessage, null, 2));
          mistralMessages.push(assistantMessage);
        } else if (textContent && textContent.trim().length > 0) {
          // Regular assistant message with non-empty content
          mistralMessages.push({
            role: 'assistant',
            content: textContent
          });
        } else {
          // Skip adding an empty assistant message (Mistral rejects empty assistant turns)
          if (isDebug) console.log('[AI Worker DEBUG] Skip empty assistant message');
        }
      } else if (msg.role === 'user' && Array.isArray(msg.content)) {
        // Handle tool results
        const toolResults = msg.content.filter(c => c.type === 'tool_result');
        if (toolResults.length > 0) {
          // IMPORTANT: Mistral requires one tool response per tool_call with matching tool_call_id
          // Do NOT merge multiple tool results into a single tool message.
          for (const tr of toolResults) {
            // Ensure content is a string (backend already stringifies JSON payloads)
            const contentStr = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content);
            const toolCallId = tr.tool_use_id || tr.tool_call_id || tr.toolCallId || tr.id;
            mistralMessages.push({
              role: 'tool',
              content: contentStr,
              // Provide both snake_case and camelCase
              tool_call_id: toolCallId,
              toolCallId: toolCallId
            });
          }
        } else {
          // Regular user message with structured content - need async processing for PDFs
          const contentPromises = msg.content.map(async c => {
            if (c.type === 'text') {
              return c.text || '';
            } else if (c.type === 'document' && c.source) {
              // Extract document content for Mistral
              if (c.source.data && c.source.media_type === 'application/pdf') {
                // Binary PDF - extract text for Mistral since it can't read PDFs
                try {
                  console.log(`[AI Worker] Extracting text from PDF for Mistral: ${c.source.name || 'Unknown'}`);
                  
                  // Import OCR service dynamically
                  const { ocrService } = await import('../services/ocrService.js');
                  
                  // Extract text from base64 PDF
                  const result = await ocrService.extractTextFromBase64PDF(
                    c.source.data, 
                    c.source.name || 'unknown.pdf'
                  );
                  
                  console.log(`[AI Worker] PDF text extracted for Mistral: ${result.text.length} characters, method: ${result.method}`);
                  return `[PDF-Inhalt: ${c.source.name || 'Unbekannt'}]\n\n${result.text}`;
                  
                } catch (error) {
                  console.error(`[AI Worker] Failed to extract PDF text for Mistral:`, error);
                  return `[PDF-Dokument: ${c.source.name || 'Unbekannt'} - Text-Extraktion fehlgeschlagen: ${error.message}]`;
                }
              } else if (c.source.data && c.source.media_type) {
                // Other binary document - convert to text description
                return `[Dokument: ${c.source.name || 'Unbekannt'} (${c.source.media_type})]`;
              } else if (c.source.text) {
                // Text document (e.g., extracted PDF in privacy mode)
                return c.source.text;
              } else {
                return `[Dokument: ${c.source.name || 'Unbekannt'}]`;
              }
            } else if (c.type === 'image' && c.source) {
              // Image content for Mistral (text description only)
              return `[Bild: ${c.source.name || 'Unbekannt'}]`;
            } else {
              return c.content || '';
            }
          });
          
          // Wait for all content processing to complete
          const processedContent = await Promise.all(contentPromises);
          const text = processedContent.join('\n');
          
          mistralMessages.push({
            role: 'user',
            content: text
          });
        }
      } else {
        // Simple string content
        mistralMessages.push({
          role: msg.role,
          content: typeof msg.content === 'string' 
            ? msg.content 
            : String(msg.content || '')
        });
      }
    }
  }

  // Debug: Log the messages being sent to Mistral (messages already adapted by PromptBuilder)
  if (isDebug) console.log(`[AI Worker DEBUG] Messages for ${requestId}:`);
  mistralMessages.forEach((msg, index) => {
    const contentPreview = msg.content 
      ? msg.content.substring(0, 200) + '...' 
      : (msg.tool_calls ? `<${msg.tool_calls.length} tool calls>` : '<empty>');
    console.log(`  [${index}] ${msg.role}: ${contentPreview}`);
    
    // Log document detection for debugging
    if (msg.role === 'user' && msg.content && (msg.content.includes('[Dokument:') || msg.content.includes('[Bild:'))) {
      const docCount = (msg.content.match(/\[Dokument:/g) || []).length;
      const imgCount = (msg.content.match(/\[Bild:/g) || []).length;
      console.log(`[AI Worker] Mistral document processing: ${docCount} documents, ${imgCount} images detected in message [${index}]`);
    }
    
    // DEEP DEBUG: Log full message structure for assistant messages with tool_calls
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      if (isDebug) console.log(`[AI Worker DEBUG] Assistant message [${index}]:`, JSON.stringify(msg, null, 2));
    }
  });

  // Mistral configuration with improved parameters for instruction following
  const mistralConfig = {
    model: model,
    messages: mistralMessages,
    max_tokens: maxTokens,
    temperature: temperature, // use override or type-specific default
    top_p: (typeof options.top_p === 'number' ? options.top_p : 0.85)  // allow override
    // Note: safe_prompt removed - not supported by Mistral API
  };
  
  // DEEP DEBUG: Log mistral config before sending
  if (isDebug) {
    console.log(`[AI Worker DEBUG] Final mistralConfig for ${requestId}:`);
    console.log(`[AI Worker DEBUG] model:`, mistralConfig.model);
    console.log(`[AI Worker DEBUG] messages:`, mistralConfig.messages?.length);
    mistralConfig.messages?.forEach((msg, i) => {
      if (msg.tool_calls) {
        console.log(`[AI Worker DEBUG] msg[${i}] tool_calls:`, JSON.stringify(msg.tool_calls, null, 2));
      }
    });
  }

  // Add tools support using ToolHandler if available
  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'mistral', requestId, type);
  if (toolsPayload.tools) {
    mistralConfig.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) {
      mistralConfig.tool_choice = toolsPayload.tool_choice;
    }
  }

  try {
    sendProgress(requestId, 30);

    if (isVerbose) console.log(`[AI Worker] Sending Mistral request for ${requestId}`);
    if (isDebug) console.log(`[AI Worker DEBUG] mistralConfig:`, JSON.stringify(mistralConfig, null, 2));
    
    let response;
    try {
      response = await mistralClient.chat.complete(mistralConfig);
    } catch (mistralError) {
      console.error(`[AI Worker] Mistral API call failed for ${requestId}:`, mistralError.message);
      if (isDebug && mistralError.message.includes('tool_calls') && mistralError.message.includes('empty')) {
        console.error(`[AI Worker DEBUG] DETECTED TOOL_CALLS EMPTY ERROR`);
        console.error(`[AI Worker DEBUG] Failing config:`, JSON.stringify(mistralConfig, null, 2));
      }
      throw mistralError;
    }
    
    sendProgress(requestId, 90);

    // Extract response content - Mistral SDK may return an array of typed chunks
    const messageContent = response.choices[0]?.message?.content || null;
    const rawToolCalls = response.choices[0]?.message?.toolCalls || response.choices[0]?.message?.tool_calls || [];
    const stopReason = response.choices[0]?.finishReason || response.choices[0]?.finish_reason || 'stop';
    
    // DEEP DEBUG: Log Mistral response structure
    if (isDebug) console.log(`[AI Worker DEBUG] Mistral raw response for ${requestId}`);

    // Normalize stop reason to common schema expected by conversation code
    const normalizedStopReason = stopReason === 'tool_calls' ? 'tool_use' : stopReason;

    // Normalize tool calls to common shape: { id, name, input }
    const toolCalls = rawToolCalls.map((call, index) => {
      const functionName = call.function?.name || call.name;
      const args = call.function?.arguments ?? call.arguments ?? call.input;
      let inputObject = {};
      if (typeof args === 'string') {
        try {
          inputObject = JSON.parse(args);
        } catch (_) {
          inputObject = {};
        }
      } else if (typeof args === 'object' && args !== null) {
        inputObject = args;
      }
      return {
        id: call.id || call.tool_call_id || `mistral_tool_${index}`,
        name: functionName,
        input: inputObject
      };
    });

    // Build raw content blocks compatible with downstream processing
    const rawContentBlocks = Array.isArray(messageContent)
      ? messageContent
      : (messageContent ? [{ type: 'text', text: messageContent }] : []);
    if (toolCalls.length > 0) {
      if (isDebug) console.log(`[AI Worker DEBUG] Build ${toolCalls.length} tool_use blocks`, JSON.stringify(toolCalls, null, 2));
      for (const tc of toolCalls) {
        const toolUseBlock = {
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input
        };
        if (isDebug) console.log(`[AI Worker DEBUG] tool_use block:`, JSON.stringify(toolUseBlock, null, 2));
        rawContentBlocks.push(toolUseBlock);
      }
    }
    if (isDebug) console.log(`[AI Worker DEBUG] rawContentBlocks for ${requestId}:`, JSON.stringify(rawContentBlocks, null, 2));

    console.log(`[AI Worker] Mistral response received for ${requestId}:`, {
      contentLength: Array.isArray(messageContent) ? messageContent.length : (messageContent?.length || 0),
      stopReason: stopReason,
      toolCallCount: toolCalls.length,
      model: response.model || model
    });

    return {
      content: Array.isArray(messageContent)
        ? messageContent.filter(b => b.type === 'text').map(b => b.text || '').join('')
        : messageContent,
      stop_reason: normalizedStopReason,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      raw_content_blocks: rawContentBlocks.length > 0 ? rawContentBlocks : (messageContent ? [{ type: 'text', text: messageContent }] : []),
      success: true,
      metadata: mergeMetadata(requestMetadata, {
        provider: 'mistral',
        model: response.model || model,
        timestamp: new Date().toISOString(),
        requestId: requestId,
        usage: response.usage
      })
    };

  } catch (error) {
    console.error(`[AI Worker] Mistral Error for request ${requestId}:`, error);
    throw new Error(`Mistral Error: ${error.message || 'Unknown error during Mistral API call'}`);
  }
} */

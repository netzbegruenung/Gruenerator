const { parentPort } = require('worker_threads');
const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const bedrockClient = require('./awsBedrockClient');
const mistralClient = require('./mistralClient');
const config = require('./worker.config');
const ToolHandler = require('../services/toolHandler');
require('dotenv').config();

// Create API clients
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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

/**
 * Merge request metadata with response metadata
 * @param {Object} requestMetadata - Original metadata from the request
 * @param {Object} responseMetadata - Metadata from the AI provider response
 * @returns {Object} Merged metadata object
 */
function mergeMetadata(requestMetadata, responseMetadata) {
  return {
    ...requestMetadata, // Preserve original metadata (including webSearchSources)
    ...responseMetadata, // Add response metadata (provider, model, etc.)
    // Ensure request metadata doesn't override critical response metadata
    provider: responseMetadata.provider,
    model: responseMetadata.model,
    timestamp: responseMetadata.timestamp
  };
}

/**
 * Check if main LLM override should be allowed based on privacy mode
 * @param {Object} options - Request options
 * @param {Object} metadata - Request metadata
 * @returns {boolean} Whether override is allowed
 */
function shouldAllowMainLlmOverride(options, metadata) {
  // Check if privacy mode is explicitly enabled
  if (options.privacyMode === true || metadata.privacyMode === true) {
    return false; // Respect privacy mode - no external models
  }
  
  // Check for privacy-related flags that should disable override
  if (options.disableExternalProviders || metadata.requiresPrivacy) {
    return false;
  }
  
  // Allow override by default when privacy mode is not set or explicitly disabled
  return true;
}

/**
 * Determine provider from model name
 * @param {string} modelName - The model identifier
 * @returns {string} Provider name
 */
function determineProviderFromModel(modelName) {
  // Bedrock ARNs or known Bedrock models
  if (modelName.includes('arn:aws:bedrock') || modelName.includes('anthropic.claude') || modelName.includes('anthropic/claude')) {
    return 'bedrock';
  }
  
  // OpenAI models
  if (modelName.includes('gpt-') || modelName.includes('openai')) {
    return 'openai';
  }
  
  // Native Mistral models (use direct API for medium, large, and small variants)
  if (modelName.includes('mistral-medium-') || 
      modelName.includes('mistral-large-') || 
      modelName.includes('mistral-small-')) {
    return 'mistral';
  }
  
  // Other Mistral models (can be accessed via different providers)
  if (modelName.includes('mistral') || modelName.includes('mixtral')) {
    // Default to LiteLLM for other Mistral models
    return 'litellm';
  }
  
  // Llama models (typically via IONOS or LiteLLM)
  if (modelName.includes('llama') || modelName.includes('meta-llama')) {
    return 'ionos'; // IONOS is our primary Llama provider
  }
  
  // Default to LiteLLM for unknown models
  return 'litellm';
}

/**
 * Privacy mode fallback system - tries privacy-friendly providers in sequence
 * @param {string} requestId - Request identifier
 * @param {Object} data - Request data
 * @returns {Promise<Object>} AI response result
 */
async function tryPrivacyModeProviders(requestId, data) {
  const privacyProviders = ['litellm', 'ionos'];
  let lastError;
  
  console.log(`[AI Worker] Attempting privacy mode fallback for request ${requestId}`);
  
  for (const provider of privacyProviders) {
    try {
      console.log(`[AI Worker] Trying privacy provider ${provider} for request ${requestId}`);
      
      const privacyData = {
        ...data,
        options: {
          ...data.options,
          provider: provider,
          // Use default models for privacy providers
          model: provider === 'litellm' ? 'llama3.3' : 'meta-llama/Llama-3.3-70B-Instruct'
        }
      };
      
      if (provider === 'litellm') {
        return await processWithLiteLLM(requestId, privacyData);
      } else if (provider === 'ionos') {
        return await processWithIONOS(requestId, privacyData);
      }
    } catch (error) {
      console.log(`[AI Worker] Privacy provider ${provider} failed for ${requestId}: ${error.message}`);
      lastError = error;
      continue;
    }
  }
  
  throw new Error(`All privacy mode providers failed. Last error: ${lastError?.message || 'Unknown error'}`);
}

// Main AI request processing function
async function processAIRequest(requestId, data) {
  // Destructure data, ensuring options exists and preserve original metadata
  const { type, prompt, options = {}, systemPrompt, messages, metadata: requestMetadata = {} } = data;

  // Check for main LLM override from environment variable
  const mainLlmOverride = process.env.MAIN_LLM_OVERRIDE;
  
  // Default provider selection
  // - QA flows (qa_tools): prefer Mistral by default for lower latency/cost and strong tool support
  // - Legacy ask flows: keep Bedrock default unless overridden
  let effectiveOptions = { ...options, useBedrock: true };
  if (type === 'qa_tools') {
    effectiveOptions = { ...effectiveOptions, provider: 'mistral', model: options.model || 'mistral-medium-latest', useBedrock: false };
  } else if (type === 'gruenerator_ask' || type === 'gruenerator_ask_grundsatz') {
    effectiveOptions = { ...effectiveOptions, useBedrock: true, model: 'anthropic.claude-3-haiku-20240307-v1:0' };
  }
  
  // Apply main LLM override if set and privacy mode allows it
  if (mainLlmOverride && shouldAllowMainLlmOverride(effectiveOptions, requestMetadata)) {
    console.log(`[AI Worker] Using main LLM override: ${mainLlmOverride} for request ${requestId}`);
    effectiveOptions = {
      ...effectiveOptions,
      model: mainLlmOverride,
      // Determine provider based on model name
      provider: determineProviderFromModel(mainLlmOverride)
    };
  }

  try {
    let result;
    
    // Check for explicit provider override - check both data.provider and options.provider
    const explicitProvider = data.provider || effectiveOptions.provider;
    if (explicitProvider) {
      switch (explicitProvider) {
        case 'litellm':
          console.log(`[AI Worker] Using LiteLLM provider for request ${requestId}`);
          sendProgress(requestId, 15);
          result = await processWithLiteLLM(requestId, { ...data, options: effectiveOptions });
          break;
        case 'bedrock':
          console.log(`[AI Worker] Using AWS Bedrock provider for request ${requestId}`);
          sendProgress(requestId, 15);
          result = await processWithBedrock(requestId, { ...data, options: effectiveOptions });
          break;
        case 'claude':
          console.log(`[AI Worker] Using Claude API provider for request ${requestId}`);
          sendProgress(requestId, 15);
          // Claude processing logic will continue below
          break;
        case 'openai':
          console.log(`[AI Worker] Using OpenAI provider for request ${requestId}`);
          sendProgress(requestId, 15);
          result = await processWithOpenAI(requestId, { ...data, options: effectiveOptions });
          break;
        case 'ionos':
          console.log(`[AI Worker] Using IONOS provider for request ${requestId}`);
          sendProgress(requestId, 15);
          result = await processWithIONOS(requestId, { ...data, options: effectiveOptions });
          break;
        case 'mistral':
          console.log(`[AI Worker] Using Mistral provider for request ${requestId}`);
          sendProgress(requestId, 15);
          result = await processWithMistral(requestId, { ...data, options: effectiveOptions });
          break;
        default:
          throw new Error(`Unknown provider: ${explicitProvider}`);
      }
    }
    
    // Use Bedrock by default (Deutschland mode), only fall back to Claude API if explicitly disabled
    if (!result && effectiveOptions.useBedrock !== false && !explicitProvider) {
      console.log(`[AI Worker] Using AWS Bedrock provider for request ${requestId}`);
      sendProgress(requestId, 15);
      // Übergebe die ursprünglichen 'data', da processWithBedrock die Optionen ggf. intern neu prüft
      result = await processWithBedrock(requestId, { ...data, options: effectiveOptions });
    } else if (!result) {
      sendProgress(requestId, 15);
      
              // Remove internal flags and betas from options before sending to Claude
        const { useBedrock, betas, ...apiOptions } = effectiveOptions;
      
      const defaultConfig = {
        model: "claude-3-7-sonnet-latest",
        max_tokens: 8000,
        temperature: 0.9
      };
      
      // Type-specific configurations
      const typeConfigs = {
        'presse': {
          system: "Du bist ein erfahrener Pressesprecher...",
          temperature: 0.4
        },
        'social': {
          system: "Du bist ein Social Media Manager...",
          temperature: 0.9
        },
        'rede': {
          system: "Du bist ein Redenschreiber...",
          temperature: 0.3
        },
        'antragsversteher': {
          system: "Du bist ein Experte für politische Anträge...",
          temperature: 0.2
        },
        'wahlprogramm': {
          system: "Du bist ein Experte für Wahlprogramme...",
          temperature: 0.2
        },
        'text_adjustment': {
          system: "Du bist ein Experte für Textoptimierung...",
          temperature: 0.3
        },
        'antrag': {
          system: "Du bist ein erfahrener Kommunalpolitiker von Bündnis 90/Die Grünen...",
          temperature: 0.3
        },
        'generator_config': {
          temperature: 0.5
        },
        'gruenerator_ask': {
          system: "Du bist ein hilfsreicher Assistent, der Fragen zu hochgeladenen Dokumenten beantwortet. Analysiere die bereitgestellten Dokumente und beantworte die Nutzerfrage präzise und hilfreich auf Deutsch.",
          model: "claude-3-5-haiku-latest",
          temperature: 0.3
        },
        'alttext': {
          system: "Du erstellst Alternativtexte (Alt-Text) für Bilder basierend auf den DBSV-Richtlinien für Barrierefreiheit.",
          model: "claude-3-5-sonnet-latest",
          temperature: 0.3,
          max_tokens: 2000
        },
        'search_enhancement': {
          system: "Du bist ein intelligenter Suchagent für deutsche politische und kommunale Inhalte. Du kannst Suchanfragen erweitern oder autonome Datenbanksuchen durchführen. Nutze verfügbare Tools für komplexe Suchen oder antworte mit JSON für einfache Abfragen.",
          model: "claude-3-5-haiku-latest",
          temperature: 0.2,
          max_tokens: 2000
        },
        'web_search_summary': {
          system: "Du bist ein Experte für die Zusammenfassung von Websuche-Ergebnissen. Erstelle präzise, informative und strukturierte Zusammenfassungen der bereitgestellten Suchergebnisse auf Deutsch. Fokussiere auf die wichtigsten Informationen, vermeide Redundanzen und strukturiere die Antwort logisch. Erwähne relevante Quellen und hebe wichtige Fakten hervor.",
          model: "claude-3-5-haiku-latest",
          temperature: 0.3,
          max_tokens: 1000
        },
        'leichte_sprache': {
          system: "Du bist ein Experte für Leichte Sprache. Übersetze Texte in Leichte Sprache nach den Regeln des Netzwerk Leichte Sprache e.V.",
          temperature: 0.3
        }
      };

      // Combine configs
      let requestConfig = {
        ...defaultConfig,
        ...(typeConfigs[type] || {}),
        ...apiOptions, // Use the cleaned options
        system: systemPrompt || (typeConfigs[type]?.system || defaultConfig.system)
      };

      // Headers setup
      const headers = {};
      if (type === 'antragsversteher' && betas?.includes('pdfs-2024-09-25')) {
        headers['anthropic-beta'] = 'pdfs-2024-09-25';
        console.log('[AI Worker] PDF Beta Header aktiviert');
      }

      // Message setup
      if (messages) {
        // Check for Files API integration with prompt caching
        if (type === 'antragsversteher' && data.fileMetadata?.usePromptCaching) {
          // Add cache control to document blocks for Files API
          requestConfig.messages = messages.map(message => ({
            ...message,
            content: message.content.map(block => {
              if (block.type === 'document' && block.source?.type === 'file') {
                return {
                  ...block,
                  cache_control: { type: 'ephemeral' }
                };
              }
              return block;
            })
          }));
          console.log(`[AI Worker] Prompt caching aktiviert für Files API Request ${requestId}`);
        } else {
          requestConfig.messages = messages;
        }
      } else if (prompt) {
        requestConfig.messages = [{
          role: "user",
          content: prompt
        }];
      }

      // Tools setup using ToolHandler
      const toolsPayload = ToolHandler.prepareToolsPayload(apiOptions, 'claude', requestId, type);
      if (toolsPayload.tools) {
        requestConfig.tools = toolsPayload.tools;
        if (toolsPayload.tool_choice) {
          requestConfig.tool_choice = toolsPayload.tool_choice;
        }
      }

      sendProgress(requestId, 30);
      
      // Make the API call with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Request Timeout nach ${config.worker.requestTimeout/1000} Sekunden`));
        }, config.worker.requestTimeout);
      });

      // Wait for Claude's response
      const response = await Promise.race([
        anthropic.messages.create(requestConfig, { headers }),
        timeoutPromise
      ]);
      
      sendProgress(requestId, 90);
      
      // Validate the response (crucial step)
      
      // Validate the response
      if (!response.content || !response.content[0] || !response.content[0].text) {
        // If stop_reason is tool_use, content[0].text might be empty, which is valid.
        // We need to check if there's content OR tool_calls.
        if (response.stop_reason !== 'tool_use' && (!response.content || !response.content[0] || typeof response.content[0].text !== 'string')) {
          throw new Error(`Invalid Claude response for request ${requestId}: missing textual content when not using tools`);
        }
        if (response.stop_reason === 'tool_use' && (!response.tool_calls || response.tool_calls.length === 0)) {
          throw new Error(`Invalid Claude response for request ${requestId}: tool_use indicated but no tool_calls provided.`);
        }
      }
      
      const textualContent = response.content?.find(block => block.type === 'text')?.text || null;

      // Create the result object - ensure it's complete before returning
      result = {
        content: textualContent, // Textual part, null if no text block
        stop_reason: response.stop_reason,
        tool_calls: response.tool_calls, // Will be present if stop_reason is 'tool_use'
        raw_content_blocks: response.content, // Full content blocks from Claude
        success: true,
        metadata: mergeMetadata(requestMetadata, {
          provider: 'claude',
          timestamp: new Date().toISOString(),
          backupRequested: false,
          requestId: requestId,
          messageId: response.id,
          isFilesApiRequest: data.fileMetadata?.fileId ? true : false,
          fileId: data.fileMetadata?.fileId || null,
          usedPromptCaching: data.fileMetadata?.usePromptCaching || false,
          modelUsed: requestConfig.model
        })
      };
      
      // Content validation is handled later in the main validation logic
    }

    sendProgress(requestId, 100);
    return result;

  } catch (error) {
    console.error(`[AI Worker] Error in processAIRequest for ${requestId}:`, error);
    
    // Final safety net: try privacy mode providers as backup
    try {
      console.log(`[AI Worker] Main processing failed for ${requestId}, attempting privacy mode fallback`);
      const result = await tryPrivacyModeProviders(requestId, data);
      console.log(`[AI Worker] Privacy mode fallback successful for ${requestId}`);
      return result;
    } catch (privacyError) {
      console.error(`[AI Worker] Privacy mode fallback also failed for ${requestId}:`, privacyError);
      // If even privacy mode fails, throw the original error
      throw error;
    }
  }
}

async function processWithOpenAI(requestId, data) {
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
      temperature: 0.9,
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
}

// Function to process request with AWS Bedrock
async function processWithBedrock(requestId, data) {
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
    temperature: options.temperature !== undefined ? options.temperature : 0.9,
    top_p: options.top_p !== undefined ? options.top_p : 1,
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
}

// Function to process request with LiteLLM
async function processWithLiteLLM(requestId, data) {
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
}

// Function to process request with IONOS
async function processWithIONOS(requestId, data) {
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
}

// Function to process request with Mistral
async function processWithMistral(requestId, data) {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;
  
  // Mistral configuration
  const model = options.model || 'mistral-medium-latest';
  
  // Type-specific temperature for better instruction following
  const mistralTemperatures = {
    'social': 0.4,      // Social media needs some creativity but must follow format
    'presse': 0.3,      // Press releases need precision
    'antrag': 0.2,      // Proposals need exact formatting
    'default': 0.35
  };
  const temperature = mistralTemperatures[type] || mistralTemperatures.default;
  
  if (!mistralClient) {
    throw new Error('Mistral client not available. Check MISTRAL_API_KEY environment variable.');
  }

  console.log(`[AI Worker] Processing with Mistral. Request ID: ${requestId}, Type: ${type}, Model: ${model}, Temperature: ${temperature}`);

  // Format messages for Mistral API
  const mistralMessages = [];
  
  if (systemPrompt) {
    mistralMessages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  if (messages) {
    messages.forEach(msg => {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        // DEEP DEBUG: Log incoming message structure
        console.log(`[AI Worker DEBUG] Processing assistant message for ${requestId}:`);
        console.log(`[AI Worker DEBUG] msg.content structure:`, JSON.stringify(msg.content, null, 2));
        
        // Check for tool_use blocks
        const toolUseBlocks = msg.content.filter(c => c.type === 'tool_use');
        console.log(`[AI Worker DEBUG] Found ${toolUseBlocks.length} tool_use blocks:`, JSON.stringify(toolUseBlocks, null, 2));
        
        const toolCalls = toolUseBlocks.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.input)
            }
          }));
        
        console.log(`[AI Worker DEBUG] Converted to ${toolCalls.length} tool_calls:`, JSON.stringify(toolCalls, null, 2));
        
        // Validate tool calls are properly formatted
        if (toolCalls.length > 0 && !toolCalls[0].function) {
          console.error(`[AI Worker] Invalid tool call format for ${requestId}:`, toolCalls);
        }
        
        const textContent = msg.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        
        if (toolCalls.length > 0) {
          // Assistant message with tool calls
          const assistantMessage = {
            role: 'assistant',
            content: textContent || '',
            toolCalls: toolCalls
          };
          console.log(`[AI Worker DEBUG] Adding assistant message with tool_calls:`, JSON.stringify(assistantMessage, null, 2));
          mistralMessages.push(assistantMessage);
        } else {
          // Regular assistant message
          mistralMessages.push({
            role: 'assistant',
            content: textContent || ''
          });
        }
      } else if (msg.role === 'user' && Array.isArray(msg.content)) {
        // Handle tool results
        const toolResults = msg.content.filter(c => c.type === 'tool_result');
        if (toolResults.length > 0) {
          // Format tool results as plain text
          const resultsText = toolResults
            .map(tr => tr.content)
            .join('\n');
          
          mistralMessages.push({
            role: 'tool',
            content: resultsText,
            toolCallId: toolResults[0].tool_use_id
          });
        } else {
          // Regular user message with structured content
          const text = msg.content
            .map(c => c.text || c.content || '')
            .join('\n');
          
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
    });
  }

  // Debug: Log the messages being sent to Mistral (messages already adapted by PromptBuilder)
  console.log(`[AI Worker] Mistral messages for ${requestId}:`);
  mistralMessages.forEach((msg, index) => {
    const contentPreview = msg.content 
      ? msg.content.substring(0, 200) + '...' 
      : (msg.tool_calls ? `<${msg.tool_calls.length} tool calls>` : '<empty>');
    console.log(`  [${index}] ${msg.role}: ${contentPreview}`);
    
    // DEEP DEBUG: Log full message structure for assistant messages with tool_calls
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      console.log(`[AI Worker DEBUG] Full assistant message [${index}]:`, JSON.stringify(msg, null, 2));
    }
  });

  // Mistral configuration with improved parameters for instruction following
  const mistralConfig = {
    model: model,
    messages: mistralMessages,
    max_tokens: options.max_tokens || 4096,
    temperature: options.temperature !== undefined ? options.temperature : temperature,
    top_p: 0.95  // Reduced from 1.0 for better consistency
    // Note: safe_prompt removed - not supported by Mistral API
  };
  
  // DEEP DEBUG: Log mistral config before sending
  console.log(`[AI Worker DEBUG] Final mistralConfig for ${requestId}:`);
  console.log(`[AI Worker DEBUG] Config model:`, mistralConfig.model);
  console.log(`[AI Worker DEBUG] Config messages count:`, mistralConfig.messages?.length);
  mistralConfig.messages?.forEach((msg, i) => {
    if (msg.tool_calls) {
      console.log(`[AI Worker DEBUG] Config message[${i}] has tool_calls:`, JSON.stringify(msg.tool_calls, null, 2));
    }
  });

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

    console.log(`[AI Worker] Sending Mistral request for ${requestId}`);
    console.log(`[AI Worker DEBUG] About to send mistralConfig:`, JSON.stringify(mistralConfig, null, 2));
    
    let response;
    try {
      response = await mistralClient.chat.complete(mistralConfig);
    } catch (mistralError) {
      console.error(`[AI Worker DEBUG] Mistral API call failed for ${requestId}:`, mistralError.message);
      if (mistralError.message.includes('tool_calls') && mistralError.message.includes('empty')) {
        console.error(`[AI Worker DEBUG] DETECTED TOOL_CALLS EMPTY ERROR! This is the bug we're hunting.`);
        console.error(`[AI Worker DEBUG] Final mistralConfig that caused the error:`, JSON.stringify(mistralConfig, null, 2));
      }
      throw mistralError;
    }
    
    sendProgress(requestId, 90);

    // Extract response content - Mistral SDK uses camelCase properties
    const responseContent = response.choices[0]?.message?.content || null;
    const rawToolCalls = response.choices[0]?.message?.toolCalls || response.choices[0]?.message?.tool_calls || [];
    const stopReason = response.choices[0]?.finishReason || response.choices[0]?.finish_reason || 'stop';
    
    // DEEP DEBUG: Log Mistral response structure
    console.log(`[AI Worker DEBUG] Mistral response for ${requestId}:`);

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

    // Build raw content blocks compatible with Claude-style tool_use continuation
    const rawContentBlocks = [];
    if (responseContent) {
      rawContentBlocks.push({ type: 'text', text: responseContent });
    }
    if (toolCalls.length > 0) {
      console.log(`[AI Worker DEBUG] Building ${toolCalls.length} tool_use blocks from toolCalls:`, JSON.stringify(toolCalls, null, 2));
      for (const tc of toolCalls) {
        const toolUseBlock = {
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: tc.input
        };
        console.log(`[AI Worker DEBUG] Adding tool_use block:`, JSON.stringify(toolUseBlock, null, 2));
        rawContentBlocks.push(toolUseBlock);
      }
    }
    console.log(`[AI Worker DEBUG] Final rawContentBlocks for ${requestId}:`, JSON.stringify(rawContentBlocks, null, 2));

    console.log(`[AI Worker] Mistral response received for ${requestId}:`, {
      contentLength: responseContent?.length || 0,
      stopReason: stopReason,
      toolCallCount: toolCalls.length,
      model: response.model || model
    });

    return {
      content: responseContent,
      stop_reason: normalizedStopReason,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      raw_content_blocks: rawContentBlocks.length > 0 ? rawContentBlocks : [{ type: 'text', text: responseContent }],
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
}

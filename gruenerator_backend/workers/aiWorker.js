const { parentPort } = require('worker_threads');
const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { Mistral } = require('@mistralai/mistralai');
const { InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");
const bedrockClient = require('./awsBedrockClient');
const config = require('./worker.config');
require('dotenv').config();

// Create API clients
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize Mistral client
const mistralApiKey = process.env.MISTRAL_API_KEY;
let mistral;
if (mistralApiKey) {
  try {
    mistral = new Mistral({ apiKey: mistralApiKey });
    console.log('[AI Worker] Mistral Client initialized.');
  } catch (error) {
     console.error('[AI Worker] Failed to initialize Mistral Client:', error);
     mistral = null; // Ensure it's null if initialization fails
  }
} else {
  console.warn('[AI Worker] MISTRAL_API_KEY not found in .env. Europa mode will not be available.');
}

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
    
    // Validate result before sending
    if (!result || !result.content || result.content.length === 0) {
      throw new Error(`Empty or invalid result generated for request ${requestId}`);
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

// Helper function to send progress updates
function sendProgress(requestId, progress) {
  try {
    parentPort.postMessage({
      type: 'progress',
      requestId,
      data: { progress }
    });
  } catch (e) {
    // Ignore errors in progress reporting
  }
}

// Main AI request processing function
async function processAIRequest(requestId, data) {
  // Destructure data, ensuring options exists
  const { type, prompt, options = {}, systemPrompt, messages, useBackupProvider, useEuropaProvider } = data;

  // Testweise Bedrock als Standard aktivieren
  const effectiveOptions = { ...options, useBedrock: true };

  try {
    let result;
    // Prüfe die Optionen mit dem (möglicherweise) überschriebenen useBedrock-Wert
    // Check for Bedrock option first (using effectiveOptions)
    if (effectiveOptions.useBedrock === true) {
      console.log(`[AI Worker] Using AWS Bedrock provider (defaulted for test) for request ${requestId}`);
      sendProgress(requestId, 15);
      // Übergebe die ursprünglichen 'data', da processWithBedrock die Optionen ggf. intern neu prüft
      result = await processWithBedrock(requestId, { ...data, options: effectiveOptions });
    }
    else if (useEuropaProvider === true) {
      console.log(`[AI Worker] Using Europa provider (Mistral) for request ${requestId}`);
      if (!mistral) {
        throw new Error('Mistral client not initialized. Check MISTRAL_API_KEY.');
      }
      sendProgress(requestId, 15);
      result = await processWithMistral(requestId, data);
    } else if (useBackupProvider === true) {
      console.log(`[AI Worker] Using backup provider (OpenAI) for request ${requestId}`);
      sendProgress(requestId, 15);
      result = await processWithOpenAI(requestId, data);
    } else {
      console.log(`[AI Worker] Using primary provider (Claude) for request ${requestId} { useBackupProvider: false, useEuropaProvider: false }`);
      sendProgress(requestId, 15);
      
      // Remove betas from options
      const { betas, ...cleanOptions } = effectiveOptions;
      
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
        }
      };

      // Combine configs
      let requestConfig = {
        ...defaultConfig,
        ...(typeConfigs[type] || {}),
        ...cleanOptions,
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
        requestConfig.messages = messages;
      } else if (prompt) {
        requestConfig.messages = [{
          role: "user",
          content: prompt
        }];
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
      
      // Log and validate the response (crucial step)
      const contentLength = response.content?.[0]?.text?.length || 0;
      console.log(`[AI Worker] Claude Antwort erhalten für ${requestId}:`, {
        type,
        contentLength,
        contentPreview: response.content?.[0]?.text?.substring(0, 100) + '...',
        id: response.id || 'unknown',
        modelUsed: requestConfig.model
      });
      
      // Validate the response
      if (!response.content || !response.content[0] || !response.content[0].text) {
        throw new Error(`Invalid Claude response for request ${requestId}: missing content`);
      }
      
      // Create the result object - ensure it's complete before returning
      result = {
        content: response.content[0].text,
        success: true,
        metadata: {
          provider: 'claude',
          timestamp: new Date().toISOString(),
          backupRequested: false,
          requestId: requestId,
          messageId: response.id,
          isPdfRequest: type === 'antragsversteher' && betas?.includes('pdfs-2024-09-25'),
          modelUsed: requestConfig.model
        }
      };
      
      // Double-check we have content before returning
      if (!result.content || typeof result.content !== 'string' || result.content.length === 0) {
        throw new Error(`Empty or invalid content in processed result for ${requestId}`);
      }
    }

    sendProgress(requestId, 100);
    return result;

  } catch (error) {
    console.error(`[AI Worker] Error in processAIRequest for ${requestId}:`, error);
    throw error;
  }
}

async function processWithOpenAI(requestId, data) {
  const { prompt, systemPrompt, messages, type } = data;
  
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
      metadata: {
        provider: 'openai',
        timestamp: new Date().toISOString(),
        backupRequested: true,
        type: type,
        requestId
      }
    };
  } catch (error) {
    console.error('[AI Worker] OpenAI Error:', error);
    throw new Error(`OpenAI Error: ${error.message}`);
  }
}

async function processWithMistral(requestId, data) {
  const { prompt, systemPrompt, messages: inputMessages, type } = data;
  const model = 'mistral-large-latest';

  console.log('[AI Worker] Mistral Request:', {
    type,
    requestId,
    hasSystemPrompt: !!systemPrompt,
    messageCount: inputMessages?.length || (prompt ? 1 : 0),
    model
  });

  const mistralMessages = [];

  let combinedFirstMessageContent = '';
  if (systemPrompt) {
    combinedFirstMessageContent = systemPrompt + '\n---\n';
  }

  if (inputMessages && inputMessages.length > 0) {
     inputMessages.forEach((msg, index) => {
       let content = msg.content;
       if (typeof content !== 'string') {
         try {
            content = JSON.stringify(content);
            console.warn(`[AI Worker] Stringified non-string message content for Mistral. Role: ${msg.role}, Request ID: ${requestId}`);
         } catch (e) {
            console.error(`[AI Worker] Failed to stringify message content for Mistral. Role: ${msg.role}, Request ID: ${requestId}`);
            content = '';
         }
       }

       if (index === 0) {
         content = combinedFirstMessageContent + content;
       }

       const role = (msg.role === 'assistant') ? 'assistant' : 'user';

       mistralMessages.push({ role: role, content: content });
     });
  } else if (prompt) {
    mistralMessages.push({ role: 'user', content: combinedFirstMessageContent + prompt });
  } else {
    throw new Error(`No messages or prompt provided for Mistral request ${requestId}`);
  }

  try {
    sendProgress(requestId, 40);

    const chatResponse = await mistral.chat.complete({
      model: model,
      messages: mistralMessages,
    });

    sendProgress(requestId, 90);

    if (!chatResponse || !chatResponse.choices || chatResponse.choices.length === 0 || !chatResponse.choices[0].message || typeof chatResponse.choices[0].message.content !== 'string') {
      console.error('[AI Worker] Invalid Mistral response structure:', JSON.stringify(chatResponse, null, 2));
      throw new Error(`Invalid Mistral response structure for request ${requestId}`);
    }

    const responseContent = chatResponse.choices[0].message.content;

    if (responseContent.length === 0) {
        console.warn(`[AI Worker] Mistral returned empty content for request ${requestId}. Model: ${model}`);
    }

    console.log(`[AI Worker] Mistral response received for ${requestId}:`, {
        type,
        contentLength: responseContent.length,
        contentPreview: responseContent.substring(0, 100) + '...',
        id: chatResponse.id || 'N/A',
        modelUsed: chatResponse.model || model
    });

    return {
      content: responseContent,
      success: true,
      metadata: {
        provider: 'mistral',
        timestamp: new Date().toISOString(),
        backupRequested: false,
        europaRequested: true,
        type: type,
        requestId: requestId,
        messageId: chatResponse.id || 'N/A',
        modelUsed: chatResponse.model || model
      }
    };
  } catch (error) {
    console.error(`[AI Worker] Mistral API Error for request ${requestId}:`, error);
    throw new Error(`Mistral API Error: ${error.message || 'Unknown error during Mistral API call'}`);
  }
}

// Function to process request with AWS Bedrock
async function processWithBedrock(requestId, data) {
  const { messages, systemPrompt, options = {} } = data;
  // Prefer ARN if available, otherwise use Model ID
  const modelIdentifier = process.env.BEDROCK_CLAUDE_MODEL_ARN || process.env.BEDROCK_CLAUDE_MODEL_ID;

  if (!modelIdentifier) {
    throw new Error('Neither BEDROCK_CLAUDE_MODEL_ARN nor BEDROCK_CLAUDE_MODEL_ID environment variable is set.');
  }

  if (!messages || messages.length === 0) {
    throw new Error('Messages are required for Bedrock request.');
  }

  console.log(`[AI Worker] Processing with Bedrock. Request ID: ${requestId}, Model: ${modelIdentifier}`);

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

  try {
    sendProgress(requestId, 20);

    // Log the exact payload being prepared for Bedrock
    console.log(`[AI Worker] Preparing Bedrock Payload for ${requestId}:`, JSON.stringify(bedrockPayload, null, 2));

    const command = new InvokeModelCommand({
      modelId: modelIdentifier, // Use ARN or ID
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(bedrockPayload),
    });

    console.log(`[AI Worker] Sending request to Bedrock: ${requestId}`);
    const response = await bedrockClient.send(command);
    sendProgress(requestId, 90);

    // Decode the response body (Uint8Array to JSON string, then parse)
    const jsonString = new TextDecoder().decode(response.body);
    // Log the raw response string from Bedrock before parsing
    console.log(`[AI Worker] Raw Bedrock response string for ${requestId}:`, jsonString);
    const parsedResponse = JSON.parse(jsonString);

    // Validate and extract content
    if (!parsedResponse.content || !Array.isArray(parsedResponse.content) || parsedResponse.content.length === 0 || !parsedResponse.content[0].text) {
      console.error("[AI Worker] Invalid Bedrock response structure:", parsedResponse);
      throw new Error(`Invalid Bedrock response structure for request ${requestId}.`);
    }
    const responseText = parsedResponse.content[0].text;

    console.log(`[AI Worker] Bedrock response received for ${requestId}: Content length ${responseText.length}`);

    return {
      content: responseText,
      success: true,
      metadata: {
        provider: 'aws-bedrock',
        model: modelIdentifier, // Log the identifier used (ARN or ID)
        timestamp: new Date().toISOString(),
        requestId: requestId,
        // Include any relevant identifiers from parsedResponse if needed, e.g., Amazon Bedrock invocation IDs
      }
    };

  } catch (error) {
    console.error(`[AI Worker] AWS Bedrock Error for request ${requestId}:`, error);
    // Distinguish SDK/AWS errors from application logic errors if possible
    throw new Error(`AWS Bedrock Error: ${error.message || 'Unknown error during Bedrock API call'}`);
  }
}
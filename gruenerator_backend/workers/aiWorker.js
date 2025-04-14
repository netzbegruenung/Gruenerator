const { parentPort } = require('worker_threads');
const { Anthropic } = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const config = require('./worker.config');
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
  const { type, prompt, options = {}, systemPrompt, messages, useBackupProvider } = data;
  
  try {
    let result;
    if (useBackupProvider === true) {
      console.log(`[AI Worker] Using backup provider (OpenAI) for request ${requestId}`);
      result = await processWithOpenAI(requestId, data);
    } else {
      console.log(`[AI Worker] Using primary provider (Claude) for request ${requestId} { useBackupProvider: false }`);
      
      // Remove betas from options
      const { betas, ...cleanOptions } = options;
      
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
        id: response.id || 'unknown'
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
          isPdfRequest: type === 'antragsversteher' && betas?.includes('pdfs-2024-09-25')
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
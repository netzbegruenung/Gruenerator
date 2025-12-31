const { mergeMetadata } = require('./adapterUtils');
const ToolHandler = require('../../services/toolHandler');
const mistralClient = require('../mistralClient');
const { connectionMetrics } = require('../mistralClient');

/**
 * Extract final answer from reasoning model response
 * Filters out thinking chunks and returns only the final text
 * Used for magistral models with prompt_mode: 'reasoning'
 */
function extractFinalAnswerFromReasoning(content) {
  if (!Array.isArray(content)) {
    return content; // Standard string response
  }
  // Filter for text chunks only, skip thinking chunks
  return content
    .filter(chunk => chunk.type === 'text')
    .map(chunk => chunk.text || '')
    .filter(text => text.trim().length > 0)
    .join('\n');
}

async function execute(requestId, data) {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  const model = options.model || 'mistral-medium-latest';

  // Content-aware top_p resolution for Mistral
  function determineTopP(type, platforms, temperature) {
    // Platform-specific values for social content (aligned with social.json)
    if (type === 'social' && platforms && Array.isArray(platforms)) {
      if (platforms.includes('pressemitteilung')) return 0.7;   // Match social.json
      if (platforms.includes('linkedin')) return 0.75;          // Match social.json
      if (platforms.includes('twitter')) return 0.95;           // Match social.json
      if (platforms.includes('facebook')) return 0.9;           // Match social.json
      if (platforms.includes('instagram')) return 0.9;          // Match social.json
      if (platforms.includes('reelScript')) return 0.95;        // Match social.json
      if (platforms.includes('actionIdeas')) return 0.95;       // Match social.json
    }

    // Type-specific values for all sharepic text generation (needs precise instruction following)
    if (type && type.startsWith('sharepic_')) return 0.7;

    // Image picker needs focused selection
    if (type === 'image_picker') return 0.8;

    // Temperature-based defaults for other types
    if (temperature <= 0.3) return 0.85;
    if (temperature <= 0.5) return 0.9;
    return 1.0;
  }

  // Content-aware max_tokens resolution for Mistral
  function determineMaxTokens(type, platforms, originalMaxTokens) {
    // Only apply custom logic for social content
    if (type === 'social' && platforms && Array.isArray(platforms)) {
      // Single platform optimization
      if (platforms.length === 1) {
        const platform = platforms[0];
        if (platform === 'pressemitteilung') return 700;  // 2000 chars ≈ 500 tokens + 40% buffer
        if (platform === 'twitter') return 120;           // 280 chars ≈ 70 tokens + 70% buffer
        if (platform === 'linkedin') return 250;          // 600 chars ≈ 150 tokens + 66% buffer
        if (platform === 'facebook') return 250;          // 600 chars ≈ 150 tokens + 66% buffer
        if (platform === 'instagram') return 250;         // 600 chars ≈ 150 tokens + 66% buffer
        if (platform === 'reelScript') return 550;        // 1500 chars ≈ 375 tokens + 46% buffer
        if (platform === 'actionIdeas') return 400;       // 1000 chars ≈ 250 tokens + 60% buffer
      }

      // Multiple platforms - use higher limit to accommodate all
      return 800;
    }

    // Image picker responses should be concise JSON
    if (type === 'image_picker') return 300;

    // Use original or default for non-social content
    return typeof originalMaxTokens === 'number' ? originalMaxTokens : 4096;
  }

  // Content-aware temperature resolution for Mistral
  function determineTemperature(type, systemPrompt, platforms, originalTemp) {
    // For social content, analyze the actual content being generated
    if (type === 'social') {
      // Check for press release (Pressemitteilung)
      if (platforms && Array.isArray(platforms) && platforms.includes('pressemitteilung')) {
        return 0.3;
      }

      // Check for formal content keywords in system prompt
      if (systemPrompt) {
        const formalKeywords = ['pressemitteilung', 'förmlich', 'sachlich', 'presseverteiler', 'journalistisch'];
        const promptLower = systemPrompt.toLowerCase();
        if (formalKeywords.some(keyword => promptLower.includes(keyword))) {
          return 0.3;
        }
      }

      // Platform-based defaults for social media
      if (platforms && Array.isArray(platforms)) {
        if (platforms.includes('linkedin')) return 0.4; // Professional
        if (platforms.includes('twitter')) return 0.5;  // Concise but engaging
        if (platforms.includes('facebook')) return 0.6; // Conversational
        if (platforms.includes('instagram')) return 0.7; // Creative, fun
        if (platforms.includes('reelScript')) return 0.6; // Authentic
      }

      // Social fallback - moderate creativity
      return 0.6;
    }

    // Type-specific defaults for non-social content
    const typeDefaults = {
      presse: 0.3,
      antrag: 0.2,
      antrag_simple: 0.2,
      kleine_anfrage: 0.2,
      grosse_anfrage: 0.2,
      antrag_question_generation: 0.7,
      web_search_summary: 0.2,
      generator_config: 0.1,
      crawler_agent: 0.1,
      qa_tools: 0.3,
      leichte_sprache: 0.3,
      image_picker: 0.2
    };

    // All sharepic types need very low temperature for precise instruction following
    if (type && type.startsWith('sharepic_')) return 0.1;

    // For other types, respect config temperature if provided, otherwise use type defaults
    if (typeDefaults[type] !== undefined) {
      return typeDefaults[type];
    }

    // Use original temperature for other types if provided
    return typeof originalTemp === 'number' ? originalTemp : 0.35;
  }

  const temperature = determineTemperature(
    type,
    systemPrompt,
    requestMetadata.platforms,
    options.temperature
  );

  const top_p = determineTopP(
    type,
    requestMetadata.platforms,
    temperature
  );

  const max_tokens = determineMaxTokens(
    type,
    requestMetadata.platforms,
    options.max_tokens
  );


  if (!mistralClient) {
    throw new Error('Mistral client not available. Check MISTRAL_API_KEY environment variable.');
  }

  const mistralMessages = [];
  if (systemPrompt) {
    mistralMessages.push({ role: 'system', content: systemPrompt });
  }
  if (messages) {
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const toolUseBlocks = msg.content.filter(c => c.type === 'tool_use');
        const toolCalls = toolUseBlocks.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.input)
          }
        }));
        const textContent = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        if (toolCalls.length > 0) {
          const assistantMessage = {
            role: 'assistant',
            ...(textContent && textContent.trim().length > 0 ? { content: textContent } : {}),
            tool_calls: toolCalls,
            toolCalls: toolCalls
          };
          mistralMessages.push(assistantMessage);
        } else if (textContent && textContent.trim().length > 0) {
          mistralMessages.push({ role: 'assistant', content: textContent });
        }
      } else if (msg.role === 'user' && Array.isArray(msg.content)) {
        const toolResults = msg.content.filter(c => c.type === 'tool_result');
        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            const contentStr = typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content);
            const toolCallId = tr.tool_use_id || tr.tool_call_id || tr.toolCallId || tr.id;
            mistralMessages.push({
              role: 'tool',
              content: contentStr,
              tool_call_id: toolCallId,
              toolCallId: toolCallId
            });
          }
        } else {
          const wantsDocQnA = options.useDocumentQnA === true;
          const hasDocs = msg.content.some(c => c.type === 'document' && c.source);

          // Helper: upload document to Mistral and return a URL (signed or data URL fallback)
          const uploadAndGetUrl = async (doc) => {
            try {
              // Prefer raw data -> upload to Mistral files API
              if (doc.source?.data) {
                const fileName = doc.source.name || 'document.pdf';
                const mediaType = doc.source.media_type || 'application/pdf';
                const base64 = doc.source.data;
                // Build content payload (Blob when available)
                let uploadPayload;
                try {
                  const blob = new Blob([Buffer.from(base64, 'base64')], { type: mediaType });
                  uploadPayload = { file: { fileName, content: blob } };
                } catch {
                  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
                  uploadPayload = { file: { fileName, content: bytes } };
                }
                let res;
                if (mistralClient.files?.upload) res = await mistralClient.files.upload(uploadPayload);
                else if (mistralClient.files?.create) res = await mistralClient.files.create(uploadPayload);
                else if (mistralClient.files?.add) res = await mistralClient.files.add(uploadPayload);
                const fileId = res?.id || res?.file?.id || res?.data?.id;
                if (fileId && mistralClient.files?.getSignedUrl) {
                  const signed = await mistralClient.files.getSignedUrl({ fileId });
                  if (signed?.url) return signed.url;
                }
                // Fallback: use data URL directly
                return `data:${mediaType};base64,${base64}`;
              }
              // If a direct URL exists, use it
              if (doc.source?.url) return doc.source.url;
              // If we have extracted text, fallback later to text path
              return null;
            } catch (e) {
              // On any failure, we return null and fall back to text extraction
              return null;
            }
          };

          if (wantsDocQnA && hasDocs) {
            // Build a structured user message using document_url blocks
            const contentArr = [];
            const preface = msg.content.find(c => c.type === 'text' && typeof c.text === 'string');
            if (preface && preface.text && preface.text.trim()) {
              contentArr.push({ type: 'text', text: preface.text.trim() });
            } else {
              contentArr.push({ type: 'text', text: 'Dokumente als Kontext:' });
            }
            for (const c of msg.content) {
              if (c.type === 'document' && c.source) {
                const url = await uploadAndGetUrl(c);
                if (url) {
                  contentArr.push({ type: 'document_url', documentUrl: url });
                } else {
                  // Fallback later: Will be included via text message in next branch
                }
              }
            }
            // Only push if we actually added any document_url
            if (contentArr.some(b => b.type === 'document_url')) {
              mistralMessages.push({ role: 'user', content: contentArr });
              continue; // proceed to next message; avoid double-adding text fallback
            }
            // If upload failed for all, fall through to text extraction
          }

          const hasImages = msg.content.some(c => c.type === 'image' && c.source?.data);

          if (hasImages) {
            const multimodalContent = [];
            for (const c of msg.content) {
              if (c.type === 'text') {
                multimodalContent.push({ type: 'text', text: c.text || '' });
              } else if (c.type === 'image' && c.source?.data) {
                const mediaType = c.source.media_type || 'image/png';
                const base64Data = c.source.data.replace(/^data:image\/[^;]+;base64,/, '');
                multimodalContent.push({
                  type: 'image_url',
                  imageUrl: {
                    url: `data:${mediaType};base64,${base64Data}`
                  }
                });
              }
            }
            mistralMessages.push({ role: 'user', content: multimodalContent });
          } else {
            const contentPromises = msg.content.map(async c => {
              if (c.type === 'text') {
                return c.text || '';
              } else if (c.type === 'document' && c.source) {
                if (c.source.data && c.source.media_type === 'application/pdf') {
                  try {
                    const { ocrService } = await import('../../services/ocrService.js');
                    const result = await ocrService.extractTextFromBase64PDF(c.source.data, c.source.name || 'unknown.pdf');
                    return `[PDF-Inhalt: ${c.source.name || 'Unbekannt'}]\n\n${result.text}`;
                  } catch (error) {
                    return `[PDF-Dokument: ${c.source.name || 'Unbekannt'} - Text-Extraktion fehlgeschlagen: ${error.message}]`;
                  }
                } else if (c.source.data && c.source.media_type) {
                  return `[Dokument: ${c.source.name || 'Unbekannt'} (${c.source.media_type})]`;
                } else if (c.source.text) {
                  return c.source.text;
                } else {
                  return `[Dokument: ${c.source.name || 'Unbekannt'}]`;
                }
              } else if (c.type === 'image' && c.source) {
                return `[Bild: ${c.source.name || 'Unbekannt'}]`;
              } else {
                return c.content || '';
              }
            });
            const processedContent = await Promise.all(contentPromises);
            const text = processedContent.join('\n');
            mistralMessages.push({ role: 'user', content: text });
          }
        }
      } else {
        // Skip system messages if we already have a systemPrompt to avoid duplication
        if (msg.role === 'system' && systemPrompt) {
          continue;
        }
        mistralMessages.push({ role: msg.role, content: typeof msg.content === 'string' ? msg.content : String(msg.content || '') });
      }
    }
  }

  const mistralConfig = {
    model,
    messages: mistralMessages,
    temperature,
    safe_prompt: false,
    top_p: typeof options.top_p === 'number' ? options.top_p : top_p,
    max_tokens: max_tokens,
    presence_penalty: options.presence_penalty || 0,
    frequency_penalty: options.frequency_penalty || 0
  };

  // Enable reasoning mode for Pro Mode with magistral models
  if (options.useProMode && model.includes('magistral')) {
    mistralConfig.prompt_mode = 'reasoning';
    // Increase max_tokens to accommodate thinking + final answer
    mistralConfig.max_tokens = Math.max(max_tokens, 6000);
    console.log(`[mistralAdapter ${requestId}] Reasoning mode enabled for Pro Mode (model=${model})`);
  }

  // Enable JSON mode for types that require structured JSON output
  if (type === 'image_picker' || type === 'text_adjustment') {
    mistralConfig.response_format = {
      type: "json_object"
    };
    console.log('[mistralAdapter] JSON mode enabled for type:', type);
  }

  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'mistral', requestId, type);
  if (toolsPayload.tools) {
    mistralConfig.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) mistralConfig.tool_choice = toolsPayload.tool_choice;
  }


  let response;
  let lastError;
  const maxRetries = 3;
  const baseDelay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        connectionMetrics.retries++;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`[mistralAdapter ${requestId}] Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      connectionMetrics.attempts++;
      response = await mistralClient.chat.complete(mistralConfig);
      connectionMetrics.successes++;

      if (attempt > 1) {
        console.log(`[mistralAdapter ${requestId}] Retry successful on attempt ${attempt}`);
      }
      break;

    } catch (mistralError) {
      lastError = mistralError;
      connectionMetrics.failures++;
      connectionMetrics.lastFailureTime = Date.now();
      connectionMetrics.lastFailureReason = mistralError.message;

      const isRetryable =
        mistralError.message?.includes('fetch failed') ||
        mistralError.message?.includes('socket') ||
        mistralError.message?.includes('ECONNRESET') ||
        mistralError.message?.includes('UND_ERR_SOCKET') ||
        mistralError.cause?.code === 'UND_ERR_SOCKET';

      if (!isRetryable || attempt === maxRetries) {
        console.error(`[mistralAdapter ${requestId}] ${isRetryable ? 'Max retries reached' : 'Non-retryable error'}:`, {
          message: mistralError.message,
          code: mistralError.code || mistralError.cause?.code,
          attempt: attempt
        });
        throw mistralError;
      }

      console.warn(`[mistralAdapter ${requestId}] Retryable connection error on attempt ${attempt}:`, mistralError.message);
    }
  }

  const messageContent = response.choices[0]?.message?.content || null;
  const rawToolCalls = response.choices[0]?.message?.toolCalls || [];
  const stopReason = response.choices[0]?.finishReason || 'stop';
  const normalizedStopReason = stopReason === 'tool_calls' ? 'tool_use' : stopReason;

  const toolCalls = rawToolCalls.map((call, index) => {
    const functionName = call.function?.name || call.name;
    const args = call.function?.arguments ?? call.arguments ?? call.input;
    let inputObject = {};
    if (typeof args === 'string') {
      try { inputObject = JSON.parse(args); } catch (_) { inputObject = {}; }
    } else if (typeof args === 'object' && args !== null) {
      inputObject = args;
    }
    return {
      id: call.id || call.tool_call_id || `mistral_tool_${index}`,
      name: functionName,
      input: inputObject
    };
  });

  const rawContentBlocks = Array.isArray(messageContent)
    ? messageContent
    : (messageContent ? [{ type: 'text', text: messageContent }] : []);
  if (toolCalls.length > 0) {
    for (const tc of toolCalls) {
      rawContentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
  }

  // Extract final answer (handles both standard and reasoning responses)
  const finalContent = extractFinalAnswerFromReasoning(messageContent);

  return {
    content: finalContent,
    stop_reason: normalizedStopReason,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    raw_content_blocks: rawContentBlocks.length > 0 ? rawContentBlocks : (messageContent ? [{ type: 'text', text: messageContent }] : []),
    success: true,
    metadata: mergeMetadata(requestMetadata, {
      provider: 'mistral',
      model: response.model || model,
      timestamp: new Date().toISOString(),
      requestId,
      usage: response.usage
    })
  };
}

module.exports = { execute };

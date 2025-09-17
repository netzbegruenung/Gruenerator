const { mergeMetadata } = require('./adapterUtils');
const ToolHandler = require('../../services/toolHandler');
const mistralClient = require('../mistralClient');

async function execute(requestId, data) {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  const model = options.model || 'mistral-medium-latest';

  // Content-aware top_p resolution for Mistral
  function determineTopP(type, platforms, temperature) {
    // Platform-specific values for social content
    if (type === 'social' && platforms && Array.isArray(platforms)) {
      if (platforms.includes('pressemitteilung')) return 0.85;
      if (platforms.includes('linkedin')) return 0.9;
      if (platforms.includes('twitter')) return 0.9;
      if (platforms.includes('facebook')) return 0.95;
      if (platforms.includes('instagram')) return 0.95;
      if (platforms.includes('reelScript')) return 0.95;
      if (platforms.includes('actionIdeas')) return 0.95;
    }

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
        if (platform === 'pressemitteilung') return 600;
        if (platform === 'twitter') return 150; // Very short tweets
        if (platform === 'linkedin') return 400;
        if (platform === 'facebook') return 350;
        if (platform === 'instagram') return 350;
        if (platform === 'reelScript') return 500;
        if (platform === 'actionIdeas') return 500;
      }

      // Multiple platforms - use higher limit to accommodate all
      return 800;
    }

    // Use original or default for non-social content
    return typeof originalMaxTokens === 'number' ? originalMaxTokens : 4096;
  }

  // Content-aware temperature resolution for Mistral
  function determineTemperature(type, systemPrompt, platforms, originalTemp) {
    // For social content, analyze the actual content being generated
    if (type === 'social') {
      // Check for press release (Pressemitteilung)
      if (platforms && Array.isArray(platforms) && platforms.includes('pressemitteilung')) {
        console.log(`[Mistral Adapter] Platform pressemitteilung detected → temperature 0.3`);
        return 0.3;
      }

      // Check for formal content keywords in system prompt
      if (systemPrompt) {
        const formalKeywords = ['pressemitteilung', 'förmlich', 'sachlich', 'presseverteiler', 'journalistisch'];
        const promptLower = systemPrompt.toLowerCase();
        if (formalKeywords.some(keyword => promptLower.includes(keyword))) {
          console.log(`[Mistral Adapter] Formal content detected in system prompt → temperature 0.3`);
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
      web_search_summary: 0.2,
      generator_config: 0.1,
      crawler_agent: 0.1,
      qa_tools: 0.3,
      leichte_sprache: 0.3
    };

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

  console.log(`[Mistral Adapter] Final config for ${requestId} (type=${type}): temperature=${temperature}, top_p=${top_p}, max_tokens=${max_tokens} (original options: temp=${options.temperature}, tokens=${options.max_tokens})`);
  if (type === 'social' && typeof options.temperature === 'number') {
    console.log(`[Mistral Adapter] Social type - ignoring config temperature ${options.temperature} in favor of content-aware temperature ${temperature}`);
  }
  if (type === 'social' && typeof options.max_tokens === 'number' && max_tokens !== options.max_tokens) {
    console.log(`[Mistral Adapter] Social type - ignoring config max_tokens ${options.max_tokens} in favor of content-aware max_tokens ${max_tokens}`);
  }

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

  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'mistral', requestId, type);
  if (toolsPayload.tools) {
    mistralConfig.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) mistralConfig.tool_choice = toolsPayload.tool_choice;
  }

  // Debug logging for full prompt (uncut)
  console.log(`[Mistral Adapter] Full prompt for ${requestId} (${mistralMessages.length} messages):`);
  mistralMessages.forEach((msg, idx) => {
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
    console.log(`[Mistral Adapter] Message ${idx} (${msg.role}) (complete): ${content}`);
  });

  let response;
  try {
    response = await mistralClient.chat.complete(mistralConfig);
  } catch (mistralError) {
    throw mistralError;
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
      requestId,
      usage: response.usage
    })
  };
}

module.exports = { execute };

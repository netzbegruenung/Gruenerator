import { mergeMetadata } from './adapterUtils.js';
import ToolHandler from '../../services/tools/index.js';
import mistralClient from '../mistralClient.js';
import { connectionMetrics } from '../mistralClient.js';
import type { AIRequestData, AIWorkerResult, Message, ToolCall, ContentBlock } from '../types.js';

interface MistralMessage {
  role: string;
  content: string | MistralContent[];
  tool_calls?: MistralToolCall[];
  toolCalls?: MistralToolCall[];
  tool_call_id?: string;
  toolCallId?: string;
}

interface MistralContent {
  type: string;
  text?: string;
  imageUrl?: { url: string };
  documentUrl?: string;
}

interface MistralToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface MistralConfig {
  model: string;
  messages: MistralMessage[];
  temperature: number;
  safe_prompt: boolean;
  top_p: number;
  max_tokens: number;
  presence_penalty: number;
  frequency_penalty: number;
  prompt_mode?: string;
  response_format?: { type: string };
  tools?: unknown[];
  tool_choice?: unknown;
}

interface MistralResponse {
  choices: Array<{
    message?: {
      content?: string | Array<{ type: string; text?: string }>;
      toolCalls?: Array<{
        id?: string;
        tool_call_id?: string;
        function?: { name: string; arguments?: string };
        name?: string;
        arguments?: string | Record<string, unknown>;
        input?: Record<string, unknown>;
      }>;
    };
    finishReason?: string;
  }>;
  model?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

function extractFinalAnswerFromReasoning(
  content: string | Array<{ type: string; text?: string }> | null
): string | null {
  if (!Array.isArray(content)) {
    return content;
  }
  return content
    .filter((chunk) => chunk.type === 'text')
    .map((chunk) => chunk.text || '')
    .filter((text) => text.trim().length > 0)
    .join('\n');
}

function determineTopP(
  type: string | undefined,
  platforms: string[] | undefined,
  temperature: number
): number {
  if (type === 'social' && platforms && Array.isArray(platforms)) {
    if (platforms.includes('pressemitteilung')) return 0.7;
    if (platforms.includes('linkedin')) return 0.75;
    if (platforms.includes('twitter')) return 0.95;
    if (platforms.includes('facebook')) return 0.9;
    if (platforms.includes('instagram')) return 0.9;
    if (platforms.includes('reelScript')) return 0.95;
    if (platforms.includes('actionIdeas')) return 0.95;
  }

  if (type && type.startsWith('sharepic_')) return 0.7;
  if (type === 'image_picker') return 0.8;

  if (temperature <= 0.3) return 0.85;
  if (temperature <= 0.5) return 0.9;
  return 1.0;
}

function determineMaxTokens(
  type: string | undefined,
  platforms: string[] | undefined,
  originalMaxTokens: number | undefined
): number {
  if (type === 'social' && platforms && Array.isArray(platforms)) {
    if (platforms.length === 1) {
      const platform = platforms[0];
      if (platform === 'pressemitteilung') return 700;
      if (platform === 'twitter') return 120;
      if (platform === 'linkedin') return 250;
      if (platform === 'facebook') return 250;
      if (platform === 'instagram') return 250;
      if (platform === 'reelScript') return 550;
      if (platform === 'actionIdeas') return 400;
    }
    return 800;
  }

  if (type === 'image_picker') return 300;

  return typeof originalMaxTokens === 'number' ? originalMaxTokens : 4096;
}

function determineTemperature(
  type: string | undefined,
  systemPrompt: string | undefined,
  platforms: string[] | undefined,
  originalTemp: number | undefined
): number {
  if (type === 'social') {
    if (platforms && Array.isArray(platforms) && platforms.includes('pressemitteilung')) {
      return 0.3;
    }

    if (systemPrompt) {
      const formalKeywords = [
        'pressemitteilung',
        'förmlich',
        'sachlich',
        'presseverteiler',
        'journalistisch',
      ];
      const promptLower = systemPrompt.toLowerCase();
      if (formalKeywords.some((keyword) => promptLower.includes(keyword))) {
        return 0.3;
      }
    }

    if (platforms && Array.isArray(platforms)) {
      if (platforms.includes('linkedin')) return 0.4;
      if (platforms.includes('twitter')) return 0.5;
      if (platforms.includes('facebook')) return 0.6;
      if (platforms.includes('instagram')) return 0.7;
      if (platforms.includes('reelScript')) return 0.6;
    }

    return 0.6;
  }

  const typeDefaults: Record<string, number> = {
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
    image_picker: 0.2,
  };

  if (type && type.startsWith('sharepic_')) return 0.1;

  if (type && typeDefaults[type] !== undefined) {
    return typeDefaults[type];
  }

  return typeof originalTemp === 'number' ? originalTemp : 0.35;
}

async function execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult> {
  const { messages, systemPrompt, options = {}, type, metadata: requestMetadata = {} } = data;

  const model = options.model || 'mistral-medium-latest';
  const platforms = (requestMetadata as { platforms?: string[] }).platforms;

  const temperature = determineTemperature(type, systemPrompt, platforms, options.temperature);
  const top_p = determineTopP(type, platforms, temperature);
  const max_tokens = determineMaxTokens(type, platforms, options.max_tokens);

  if (!mistralClient) {
    throw new Error('Mistral client not available. Check MISTRAL_API_KEY environment variable.');
  }

  const mistralMessages: MistralMessage[] = [];
  if (systemPrompt) {
    mistralMessages.push({ role: 'system', content: systemPrompt });
  }

  if (messages) {
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const content = msg.content as Array<{
          type: string;
          id?: string;
          name?: string;
          input?: unknown;
          text?: string;
        }>;
        const toolUseBlocks = content.filter((c) => c.type === 'tool_use');
        const toolCalls: MistralToolCall[] = toolUseBlocks.map((tc) => ({
          id: tc.id || '',
          type: 'function',
          function: {
            name: tc.name || '',
            arguments: JSON.stringify(tc.input),
          },
        }));
        const textContent = content
          .filter((c) => c.type === 'text')
          .map((c) => c.text || '')
          .join('\n');
        if (toolCalls.length > 0) {
          const assistantMessage: MistralMessage = {
            role: 'assistant',
            content: textContent && textContent.trim().length > 0 ? textContent : '',
            tool_calls: toolCalls,
            toolCalls: toolCalls,
          };
          mistralMessages.push(assistantMessage);
        } else if (textContent && textContent.trim().length > 0) {
          mistralMessages.push({ role: 'assistant', content: textContent });
        }
      } else if (msg.role === 'user' && Array.isArray(msg.content)) {
        const content = msg.content as Array<{
          type: string;
          tool_use_id?: string;
          tool_call_id?: string;
          toolCallId?: string;
          id?: string;
          content?: unknown;
          text?: string;
          source?: {
            data?: string;
            media_type?: string;
            name?: string;
            url?: string;
            text?: string;
          };
        }>;
        const toolResults = content.filter((c) => c.type === 'tool_result');
        if (toolResults.length > 0) {
          for (const tr of toolResults) {
            const contentStr =
              typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content);
            const toolCallId = tr.tool_use_id || tr.tool_call_id || tr.toolCallId || tr.id || '';
            mistralMessages.push({
              role: 'tool',
              content: contentStr,
              tool_call_id: toolCallId,
              toolCallId: toolCallId,
            });
          }
        } else {
          const wantsDocQnA = options.useDocumentQnA === true;
          const hasDocs = content.some((c) => c.type === 'document' && c.source);

          const uploadAndGetUrl = async (doc: {
            source?: { data?: string; media_type?: string; name?: string; url?: string };
          }): Promise<string | null> => {
            try {
              if (doc.source?.data) {
                const fileName = doc.source.name || 'document.pdf';
                const mediaType = doc.source.media_type || 'application/pdf';
                const base64 = doc.source.data;
                let uploadPayload: { file: { fileName: string; content: Blob | Uint8Array } };
                try {
                  const blob = new Blob([Buffer.from(base64, 'base64')], { type: mediaType });
                  uploadPayload = { file: { fileName, content: blob } };
                } catch {
                  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
                  uploadPayload = { file: { fileName, content: bytes } };
                }
                let res:
                  | { id?: string; file?: { id?: string }; data?: { id?: string } }
                  | undefined;
                const files = (
                  mistralClient as unknown as {
                    files?: {
                      upload?: (p: unknown) => Promise<unknown>;
                      create?: (p: unknown) => Promise<unknown>;
                      add?: (p: unknown) => Promise<unknown>;
                      getSignedUrl?: (p: { fileId: string }) => Promise<{ url?: string }>;
                    };
                  }
                ).files;
                if (files?.upload) res = (await files.upload(uploadPayload)) as typeof res;
                else if (files?.create) res = (await files.create(uploadPayload)) as typeof res;
                else if (files?.add) res = (await files.add(uploadPayload)) as typeof res;
                const fileId = res?.id || res?.file?.id || res?.data?.id;
                if (fileId && files?.getSignedUrl) {
                  const signed = await files.getSignedUrl({ fileId });
                  if (signed?.url) return signed.url;
                }
                return `data:${mediaType};base64,${base64}`;
              }
              if (doc.source?.url) return doc.source.url;
              return null;
            } catch {
              return null;
            }
          };

          if (wantsDocQnA && hasDocs) {
            const contentArr: MistralContent[] = [];
            const preface = content.find((c) => c.type === 'text' && typeof c.text === 'string');
            if (preface && preface.text && preface.text.trim()) {
              contentArr.push({ type: 'text', text: preface.text.trim() });
            } else {
              contentArr.push({ type: 'text', text: 'Dokumente als Kontext:' });
            }
            for (const c of content) {
              if (c.type === 'document' && c.source) {
                const url = await uploadAndGetUrl(c);
                if (url) {
                  contentArr.push({ type: 'document_url', documentUrl: url });
                }
              }
            }
            if (contentArr.some((b) => b.type === 'document_url')) {
              mistralMessages.push({ role: 'user', content: contentArr });
              continue;
            }
          }

          const hasImages = content.some((c) => c.type === 'image' && c.source?.data);

          if (hasImages) {
            const multimodalContent: MistralContent[] = [];
            for (const c of content) {
              if (c.type === 'text') {
                multimodalContent.push({ type: 'text', text: c.text || '' });
              } else if (c.type === 'image' && c.source?.data) {
                const mediaType = c.source.media_type || 'image/png';
                const base64Data = c.source.data.replace(/^data:image\/[^;]+;base64,/, '');
                multimodalContent.push({
                  type: 'image_url',
                  imageUrl: {
                    url: `data:${mediaType};base64,${base64Data}`,
                  },
                });
              }
            }
            mistralMessages.push({ role: 'user', content: multimodalContent });
          } else {
            const contentPromises = content.map(async (c) => {
              if (c.type === 'text') {
                return c.text || '';
              } else if (c.type === 'document' && c.source) {
                if (c.source.data && c.source.media_type === 'application/pdf') {
                  try {
                    const { ocrService } = await import('../../services/ocrService.js');
                    const result = await ocrService.extractTextFromBase64PDF(
                      c.source.data,
                      c.source.name || 'unknown.pdf'
                    );
                    return `[PDF-Inhalt: ${c.source.name || 'Unbekannt'}]\n\n${result.text}`;
                  } catch (error: unknown) {
                    const err = error as { message?: string };
                    return `[PDF-Dokument: ${c.source.name || 'Unbekannt'} - Text-Extraktion fehlgeschlagen: ${err.message || 'Unknown error'}]`;
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
                return (c as { content?: string }).content || '';
              }
            });
            const processedContent = await Promise.all(contentPromises);
            const text = processedContent.join('\n');
            mistralMessages.push({ role: 'user', content: text });
          }
        }
      } else {
        if (msg.role === 'system' && systemPrompt) {
          continue;
        }
        mistralMessages.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : String(msg.content || ''),
        });
      }
    }
  }

  const mistralConfig: MistralConfig = {
    model,
    messages: mistralMessages,
    temperature,
    safe_prompt: false,
    top_p: typeof options.top_p === 'number' ? options.top_p : top_p,
    max_tokens: max_tokens,
    presence_penalty: (options as { presence_penalty?: number }).presence_penalty || 0,
    frequency_penalty: (options as { frequency_penalty?: number }).frequency_penalty || 0,
  };

  if (options.useProMode && model.includes('magistral')) {
    mistralConfig.prompt_mode = 'reasoning';
    mistralConfig.max_tokens = Math.max(max_tokens, 6000);
    console.log(
      `[mistralAdapter ${requestId}] Reasoning mode enabled for Pro Mode (model=${model})`
    );
  }

  if (type === 'image_picker' || type === 'text_adjustment') {
    mistralConfig.response_format = { type: 'json_object' };
    console.log('[mistralAdapter] JSON mode enabled for type:', type);
  }

  const toolsPayload = ToolHandler.prepareToolsPayload(options, 'mistral', requestId, type);
  if (toolsPayload.tools) {
    mistralConfig.tools = toolsPayload.tools;
    if (toolsPayload.tool_choice) mistralConfig.tool_choice = toolsPayload.tool_choice;
  }

  let response: MistralResponse | undefined;
  let lastError: Error | undefined;
  const maxRetries = 3;
  const baseDelay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        connectionMetrics.retries++;
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(
          `[mistralAdapter ${requestId}] Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      connectionMetrics.attempts++;
      response = await (
        mistralClient.chat as { complete: (config: MistralConfig) => Promise<MistralResponse> }
      ).complete(mistralConfig);
      connectionMetrics.successes++;

      if (attempt > 1) {
        console.log(`[mistralAdapter ${requestId}] Retry successful on attempt ${attempt}`);
      }
      break;
    } catch (mistralError: unknown) {
      const err = mistralError as { message?: string; code?: string; cause?: { code?: string } };
      lastError = mistralError as Error;
      connectionMetrics.failures++;
      connectionMetrics.lastFailureTime = Date.now();
      connectionMetrics.lastFailureReason = err.message || 'Unknown error';

      const isRetryable =
        err.message?.includes('fetch failed') ||
        err.message?.includes('socket') ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('UND_ERR_SOCKET') ||
        err.cause?.code === 'UND_ERR_SOCKET';

      if (!isRetryable || attempt === maxRetries) {
        console.error(
          `[mistralAdapter ${requestId}] ${isRetryable ? 'Max retries reached' : 'Non-retryable error'}:`,
          {
            message: err.message,
            code: err.code || err.cause?.code,
            attempt: attempt,
          }
        );
        throw mistralError;
      }

      console.warn(
        `[mistralAdapter ${requestId}] Retryable connection error on attempt ${attempt}:`,
        err.message
      );
    }
  }

  if (!response) {
    throw lastError || new Error('No response received from Mistral');
  }

  const messageContent = response.choices[0]?.message?.content || null;
  const rawToolCalls = response.choices[0]?.message?.toolCalls || [];
  const stopReason = response.choices[0]?.finishReason || 'stop';
  const normalizedStopReason = stopReason === 'tool_calls' ? 'tool_use' : stopReason;

  const toolCalls: ToolCall[] = rawToolCalls.map((call, index) => {
    const functionName = call.function?.name || call.name || '';
    const args = call.function?.arguments ?? call.arguments ?? call.input;
    let inputObject: Record<string, unknown> = {};
    if (typeof args === 'string') {
      try {
        inputObject = JSON.parse(args);
      } catch {
        inputObject = {};
      }
    } else if (typeof args === 'object' && args !== null) {
      inputObject = args as Record<string, unknown>;
    }
    return {
      id: call.id || call.tool_call_id || `mistral_tool_${index}`,
      name: functionName,
      input: inputObject,
    };
  });

  const rawContentBlocks: ContentBlock[] = Array.isArray(messageContent)
    ? messageContent
    : messageContent
      ? [{ type: 'text', text: messageContent }]
      : [];
  if (toolCalls.length > 0) {
    for (const tc of toolCalls) {
      rawContentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
  }

  const finalContent = extractFinalAnswerFromReasoning(messageContent);

  return {
    content: finalContent,
    stop_reason: normalizedStopReason,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    raw_content_blocks:
      rawContentBlocks.length > 0
        ? rawContentBlocks
        : messageContent
          ? [{ type: 'text', text: messageContent as string }]
          : [],
    success: true,
    metadata: mergeMetadata(requestMetadata, {
      provider: 'mistral',
      model: response.model || model,
      timestamp: new Date().toISOString(),
      requestId,
      usage: response.usage,
    }),
  };
}

export { execute };

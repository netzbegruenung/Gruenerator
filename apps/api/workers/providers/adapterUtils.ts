import { jsonSchema, type ModelMessage, type Tool } from 'ai';

import type { AIRequestData } from '../types.js';
import type { RequestMetadata, ResponseMetadata } from './types.js';

/**
 * Build the Vercel AI SDK `tools` map from a ToolHandler payload.
 *
 * `formatToolsForProvider` emits OpenAI-nested tools
 * (`{type:'function', function:{name,description,parameters}}`); some callers
 * pass flat Claude-ish (`{name,description,input_schema}`). Read both. The raw
 * JSON Schema must be wrapped with `jsonSchema()` — the SDK silently rejects a
 * plain object as `inputSchema`, and reading the wrong (flat) fields off the
 * nested shape produced an unusable `tools.undefined` entry, so the model saw no
 * callable tool and never made a tool call.
 */
export function buildAiSdkTools(toolsPayload: {
  tools?: unknown[] | undefined;
}): Record<string, Tool> | undefined {
  if (!toolsPayload.tools || toolsPayload.tools.length === 0) return undefined;
  const tools: Record<string, Tool> = {};
  for (const raw of toolsPayload.tools as Array<Record<string, unknown>>) {
    const fn = ((raw.function as Record<string, unknown> | undefined) ?? raw) as {
      name?: string;
      description?: string;
      parameters?: unknown;
      input_schema?: unknown;
    };
    if (!fn.name) continue;
    const schema = (fn.parameters ??
      fn.input_schema ?? { type: 'object', properties: {} }) as Parameters<typeof jsonSchema>[0];
    tools[fn.name] = {
      description: fn.description ?? '',
      inputSchema: jsonSchema(schema),
    };
  }
  return Object.keys(tools).length > 0 ? tools : undefined;
}

export function mergeMetadata(
  requestMetadata: RequestMetadata = {},
  responseMetadata: ResponseMetadata
): ResponseMetadata & RequestMetadata {
  return {
    ...requestMetadata,
    ...responseMetadata,
    provider: responseMetadata.provider,
    model: responseMetadata.model,
    timestamp: responseMetadata.timestamp,
  };
}

/**
 * Convert internal message format to AI SDK `ModelMessage[]`, preserving image
 * parts (base64 `source.data` and `image_url`). Shared by the OpenAI-compatible
 * adapters (Regolo, GreenPT).
 */
export function convertMessagesWithImages(
  messages: AIRequestData['messages'],
  systemPrompt?: string
): { system: string | undefined; messages: ModelMessage[] } {
  const systemParts: string[] = [];
  if (systemPrompt) systemParts.push(systemPrompt);

  const modelMessages: ModelMessage[] = [];

  if (!messages) {
    return {
      system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
      messages: modelMessages,
    };
  }

  for (const msg of messages) {
    if (msg.role === 'system') {
      const sysContent =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.content)
            ? (msg.content as Array<{ text?: string; content?: string }>)
                .map((c) => c.text || c.content || '')
                .join('\n')
            : String(msg.content);
      systemParts.push(sysContent);
      continue;
    }

    if (typeof msg.content === 'string') {
      modelMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
      continue;
    }

    if (Array.isArray(msg.content)) {
      const contentParts = msg.content as Array<{
        type: string;
        text?: string;
        content?: string;
        source?: { data?: string; media_type?: string };
        image_url?: { url: string };
      }>;

      const hasImages = contentParts.some(
        (c) =>
          (c.type === 'image' && c.source?.data) || (c.type === 'image_url' && c.image_url?.url)
      );

      if (hasImages) {
        const parts: Array<
          { type: 'text'; text: string } | { type: 'image'; image: Buffer | URL; mimeType?: string }
        > = [];

        for (const c of contentParts) {
          if (c.type === 'text') {
            parts.push({ type: 'text', text: c.text || '' });
          } else if (c.type === 'image' && c.source?.data) {
            const mediaType = c.source.media_type || 'image/png';
            const base64Data = c.source.data.replace(/^data:image\/[^;]+;base64,/, '');
            parts.push({
              type: 'image',
              image: Buffer.from(base64Data, 'base64'),
              mimeType: mediaType,
            });
          } else if (c.type === 'image_url' && c.image_url?.url) {
            const url = c.image_url.url;
            if (url.startsWith('data:')) {
              const match = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
              if (match) {
                parts.push({
                  type: 'image',
                  image: Buffer.from(match[2], 'base64'),
                  mimeType: match[1],
                });
              }
            } else {
              parts.push({ type: 'image', image: new URL(url) });
            }
          }
        }

        modelMessages.push({ role: 'user', content: parts });
        continue;
      }

      const textContent = contentParts.map((c) => c.text || c.content || '').join('\n');

      modelMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: textContent,
      });
      continue;
    }

    modelMessages.push({
      role: msg.role as 'user' | 'assistant',
      content: String(msg.content),
    });
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: modelMessages,
  };
}

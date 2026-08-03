import { jsonSchema, type ModelMessage, type Tool } from 'ai';

import type { AIRequestData, AIWorkerResult, ContentBlock, ToolCall } from '../types.js';
import type { RequestMetadata, ResponseMetadata } from './types.js';

/** The AI SDK's own `Schema` wrapper, as produced by `jsonSchema()`. */
type SdkSchema = ReturnType<typeof jsonSchema>;

/**
 * Is this ALREADY an AI-SDK schema wrapper?
 *
 * `jsonSchema()` is not idempotent, and wrapping a wrapper fails silently in the
 * worst possible way: the tool's `parameters` then serialise to
 * `{"jsonSchema": {…the real schema…}}` — no top-level `type`, no `properties`.
 * The model obeys that shape, nests its whole payload under a `jsonSchema` key,
 * and every downstream validator rejects it with "title: Required". It reads
 * like an unreliable model; it is our own double wrap.
 *
 * Callers are genuinely split about which shape they hand over —
 * `generateStructured` and `toolForcedEdit` wrap before calling, the MCP
 * catalogs pass raw JSON Schema — so this detects instead of demanding one.
 * `isSchema` is internal to @ai-sdk/provider-utils (not re-exported by `ai`),
 * hence the mirrored predicate; checked against ai@7.0.37.
 */
function isSdkSchema(value: unknown): value is SdkSchema {
  return (
    typeof value === 'object' && value !== null && 'jsonSchema' in value && 'validate' in value
  );
}

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
    const schema = fn.parameters ?? fn.input_schema ?? { type: 'object', properties: {} };
    tools[fn.name] = {
      description: fn.description ?? '',
      inputSchema: isSdkSchema(schema)
        ? schema
        : jsonSchema(schema as Parameters<typeof jsonSchema>[0]),
    };
  }
  return Object.keys(tools).length > 0 ? tools : undefined;
}

/** What the SDK accepts for `toolChoice`. */
export type SdkToolChoice = 'auto' | 'none' | 'required' | { type: 'tool'; toolName: string };

/**
 * Translate a ToolHandler `tool_choice` into the SDK's shape.
 *
 * Was copy-pasted into all four adapters, and only the Mistral copy understood
 * `{type:'tool', name}` — the other three folded "call exactly THIS tool" into
 * `'auto'`, i.e. into "call one if you feel like it". No live caller passes the
 * object form, so nothing changes today; what changes is that forcing a
 * specific tool is no longer silently conditional on which provider happens to
 * answer, which matters the moment the fallback chain moves a forced call.
 *
 * `undefined` means "tools were offered but no choice stated", which the
 * adapters have always read as `'none'` — kept, because flipping it would let
 * every request carrying a tool catalogue start calling tools.
 */
export function resolveToolChoice(choice: unknown): SdkToolChoice {
  if (choice === 'required') return 'required';
  if (choice === undefined || choice === 'none') return 'none';
  if (typeof choice === 'object' && choice !== null) {
    const c = choice as { type?: string; name?: string; toolName?: string };
    if (c.type === 'tool') return { type: 'tool', toolName: c.toolName ?? c.name ?? '' };
  }
  return 'auto';
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

/** A block inside an array-shaped message. Deliberately loose: callers build
 *  these by hand in Claude-ish, OpenAI-ish and internal shapes. */
interface ContentPart {
  type: string;
  text?: string;
  content?: unknown;
  tool_use_id?: string;
  tool_call_id?: string;
  toolCallId?: string;
  id?: string;
  name?: string;
  input?: unknown;
  image_url?: { url: string };
  source?: {
    data?: string;
    media_type?: string;
    name?: string;
    url?: string;
    text?: string;
  };
}

type ImagePart = { type: 'image'; image: Buffer | URL; mimeType?: string };
type TextPart = { type: 'text'; text: string };

function flattenToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (content as ContentPart[]).map((c) => c.text || String(c.content ?? '')).join('\n');
  }
  return String(content ?? '');
}

/** An image block in either dialect, or null if this part is not an image. */
function toImagePart(c: ContentPart): ImagePart | null {
  if (c.type === 'image' && c.source?.data) {
    const mimeType = c.source.media_type || 'image/png';
    const base64 = c.source.data.replace(/^data:image\/[^;]+;base64,/, '');
    return { type: 'image', image: Buffer.from(base64, 'base64'), mimeType };
  }
  if (c.type === 'image_url' && c.image_url?.url) {
    const url = c.image_url.url;
    const dataUri = url.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (dataUri) {
      return {
        type: 'image',
        image: Buffer.from(dataUri[2] as string, 'base64'),
        mimeType: dataUri[1] as string,
      };
    }
    if (!url.startsWith('data:')) return { type: 'image', image: new URL(url) };
  }
  return null;
}

/** A document block as text. PDFs go through OCR; anything else contributes
 *  whatever text it carries, or a placeholder so the model knows it existed. */
async function documentToText(c: ContentPart): Promise<string> {
  const source = c.source;
  if (!source) return '';
  if (source.data && source.media_type === 'application/pdf') {
    try {
      const { ocrService } = await import('../../services/ocrService.js');
      const result = await ocrService.extractTextFromBase64PDF(
        source.data,
        source.name || 'unknown.pdf'
      );
      return `[PDF-Inhalt: ${source.name || 'Unbekannt'}]\n\n${result.text}`;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return `[PDF-Dokument: ${source.name || 'Unbekannt'} - Text-Extraktion fehlgeschlagen: ${message}]`;
    }
  }
  if (source.text) return source.text;
  return `[Dokument: ${source.name || 'Unbekannt'}]`;
}

/**
 * Convert the internal message shape to AI SDK `ModelMessage[]`.
 *
 * ONE converter for every provider. There used to be three, with three
 * different capability sets, and which one ran was decided by the fallback
 * chain rather than by the caller:
 *
 *   mistral  tool round-trips, base64 images, PDF→OCR — but not `image_url`
 *   regolo   base64 images and `image_url` — but no tool round-trips
 *   greenpt  (a copy of regolo)
 *   litellm  text only: `c.text || c.content || ''`, so a document or image
 *            block collapsed to an empty string
 *
 * The litellm case is the one that bites. `promptAssemblyGraph` builds
 * `{type:'document'}` / `{type:'image'}` blocks, `PromptProcessor` hands them
 * straight to the service, and litellm is the lane every unmapped `routeType`
 * lands on — so attachments were dropped without a word, leaving blank lines
 * where the material should have been.
 *
 * This is the union: every shape any of the three understood, understood by all.
 */
export async function convertMessages(
  messages: AIRequestData['messages'],
  systemPrompt?: string
): Promise<{ system: string | undefined; messages: ModelMessage[] }> {
  const systemParts: string[] = [];
  if (systemPrompt) systemParts.push(systemPrompt);

  const modelMessages: ModelMessage[] = [];
  const done = (): { system: string | undefined; messages: ModelMessage[] } => ({
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    messages: modelMessages,
  });

  if (!messages) return done();

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemParts.push(flattenToText(msg.content));
      continue;
    }

    if (typeof msg.content === 'string') {
      modelMessages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
      continue;
    }

    if (!Array.isArray(msg.content)) {
      modelMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: String(msg.content ?? ''),
      });
      continue;
    }

    const parts = msg.content as ContentPart[];

    // Assistant turn that made tool calls — replayed so the model sees its own
    // side of the exchange.
    if (msg.role === 'assistant') {
      const toolUses = parts.filter((c) => c.type === 'tool_use');
      const text = parts
        .filter((c) => c.type === 'text')
        .map((c) => c.text || '')
        .join('\n');

      if (toolUses.length > 0) {
        modelMessages.push({
          role: 'assistant',
          content: [
            ...(text ? [{ type: 'text' as const, text }] : []),
            ...toolUses.map((tc) => ({
              type: 'tool-call' as const,
              toolCallId: tc.id || '',
              toolName: tc.name || '',
              input: tc.input as Record<string, unknown>,
            })),
          ],
        });
      } else if (text) {
        modelMessages.push({ role: 'assistant', content: text });
      }
      continue;
    }

    // Tool results arrive on a user turn but are their own role for the SDK.
    const toolResults = parts.filter((c) => c.type === 'tool_result');
    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        modelMessages.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result' as const,
              toolCallId: tr.tool_use_id || tr.tool_call_id || tr.toolCallId || tr.id || '',
              toolName: tr.name || '', // matched by toolCallId when absent
              output: {
                type: 'text' as const,
                value: typeof tr.content === 'string' ? tr.content : JSON.stringify(tr.content),
              },
            },
          ],
        });
      }
      continue;
    }

    const images = parts.map(toImagePart).filter((p): p is ImagePart => p !== null);
    if (images.length > 0) {
      const mixed: Array<TextPart | ImagePart> = [];
      for (const c of parts) {
        if (c.type === 'text') {
          mixed.push({ type: 'text', text: c.text || '' });
          continue;
        }
        const image = toImagePart(c);
        if (image) mixed.push(image);
      }
      modelMessages.push({ role: 'user', content: mixed });
      continue;
    }

    // Text and documents. Sequential rather than mapped: PDF OCR is the only
    // async step and running a stack of them at once buys nothing.
    const texts: string[] = [];
    for (const c of parts) {
      if (c.type === 'text') texts.push(c.text || '');
      else if (c.type === 'document') texts.push(await documentToText(c));
      else if (c.content != null) texts.push(String(c.content));
    }
    modelMessages.push({ role: 'user', content: texts.filter(Boolean).join('\n') });
  }

  return done();
}

/** The parts of `generateText`'s result the adapters actually read. */
interface SdkTextResult {
  text?: string | undefined;
  finishReason?: string | undefined;
  toolCalls?: Array<{ toolCallId?: string; toolName: string; input: unknown }> | undefined;
  usage?:
    | {
        inputTokens?: number | undefined;
        outputTokens?: number | undefined;
        totalTokens?: number | undefined;
      }
    | undefined;
}

/**
 * Turn an SDK result into the `AIWorkerResult` the call sites expect.
 *
 * Written once because the four adapters disagreed on two points and neither
 * disagreement was a decision anyone made:
 *
 * - **Empty answers.** litellm alone THREW; the other three returned empty
 *   content. Both end up in `executeFallback`, so the outcome was the same —
 *   but the throw discarded `metadata.usage`, so the tokens a truncated answer
 *   had already burned went unrecorded. Uniformly: return it, let the caller's
 *   own emptiness check decide.
 * - **The `finishReason === 'length'` diagnostic.** Also litellm-only, and it is
 *   most valuable exactly where it was missing: reasoning models (gpt-oss, the
 *   GreenPT thinking lanes) bill their chain of thought against `max_tokens`
 *   and can exhaust the budget before writing a single word of answer. Without
 *   the log that reads as "the model returned nothing".
 *
 * `raw_content_blocks` is `undefined` when there is nothing to put in it —
 * mistral's shape. The `[{type:'text', text:''}]` filler the other three
 * emitted reads as `''` at every consumer, so this changes nothing for them.
 */
export function buildAdapterResult(params: {
  provider: string;
  model: string;
  requestId: string;
  type?: string | undefined;
  requestMetadata?: RequestMetadata | undefined;
  result: SdkTextResult;
}): AIWorkerResult {
  const { provider, model, requestId, type, requestMetadata = {}, result } = params;

  const textContent = result.text || null;

  if (result.finishReason === 'length') {
    console.warn(
      `[${provider}Adapter ${requestId}] Output token budget exhausted (finish_reason=length) ` +
        `for type=${type}, model=${model}. Usage: ${JSON.stringify(result.usage)}. ` +
        `Reasoning tokens count against max_tokens — raise the budget if answers are truncated.`
    );
  }

  const toolCalls: ToolCall[] | undefined =
    result.toolCalls && result.toolCalls.length > 0
      ? result.toolCalls.map((tc, index) => ({
          id: tc.toolCallId || `${provider}_tool_${index}`,
          name: tc.toolName,
          input: tc.input as Record<string, unknown>,
        }))
      : undefined;

  const rawContentBlocks: ContentBlock[] = [];
  if (textContent) rawContentBlocks.push({ type: 'text', text: textContent });
  for (const tc of toolCalls ?? []) {
    rawContentBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
  }

  return {
    content: textContent,
    stop_reason: result.finishReason === 'tool-calls' ? 'tool_use' : result.finishReason || 'stop',
    tool_calls: toolCalls,
    raw_content_blocks: rawContentBlocks.length > 0 ? rawContentBlocks : undefined,
    success: true,
    metadata: mergeMetadata(requestMetadata, {
      provider,
      model,
      timestamp: new Date().toISOString(),
      requestId,
      ...(result.usage && {
        usage: {
          prompt_tokens: result.usage.inputTokens,
          completion_tokens: result.usage.outputTokens,
          total_tokens: result.usage.totalTokens,
        },
      }),
    }),
  };
}

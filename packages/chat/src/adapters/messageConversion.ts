import { INTENT_TO_TOOL } from '../lib/toolMappings';

interface PersistedToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

export interface LoadedMessage {
  id: string;
  role: string;
  content: string;
  created_at?: string;
  metadata?: {
    intent?: string;
    searchCount?: number;
    traceId?: string;
    citations?: Array<{
      id: number;
      title: string;
      url: string;
      snippet?: string;
      domain?: string;
    }>;
    searchResults?: Array<{ title: string; url: string; snippet?: string }>;
    /**
     * Web-search image hits. `proxyUrl` is minted fresh by the backend on every
     * load (the persisted row holds none — a signed handle expires, the row does
     * not), so a reloaded thread can still show thumbnails rather than links.
     */
    searchImages?: Array<{ title: string; url: string; domain: string; proxyUrl?: string }>;
    generatedImage?: { url: string; prompt?: string; [key: string]: unknown };
    toolCalls?: PersistedToolCall[];
    senderId?: string;
    senderName?: string | null;
    roleName?: string;
    /** Row was still status='streaming' after request end — interrupted turn. */
    interrupted?: boolean;
  };
}

type ToolCallPart = {
  readonly type: 'tool-call';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly args: Record<string, string>;
  readonly result?: unknown;
};

type TextPart = { type: 'text'; text: string };

export interface ConvertedMessage {
  role: 'user' | 'assistant';
  content: Array<TextPart | ToolCallPart>;
  id: string;
  metadata?: { custom: Record<string, unknown> };
}

export function extractContent(content: unknown): string {
  if (typeof content !== 'string') return '';

  if (content.startsWith('[{') && content.includes('"type":"text"')) {
    try {
      const parts = JSON.parse(content);
      if (Array.isArray(parts)) {
        return parts
          .filter(
            (p: unknown): p is { type: string; text: string } =>
              p !== null && typeof p === 'object' && 'type' in p && p.type === 'text' && 'text' in p
          )
          .map((p) => p.text)
          .join('');
      }
    } catch {
      // Not valid JSON, return as-is
    }
  }

  return content;
}

export function convertToThreadMessageLike(messages: LoadedMessage[]): ConvertedMessage[] {
  return messages
    .filter(
      // Interrupted turn with no delta ever received: nothing to render.
      (m) =>
        !(
          m.role === 'assistant' &&
          m.metadata?.interrupted &&
          !extractContent(m.content) &&
          !m.metadata?.toolCalls?.length
        )
    )
    .map((m) => {
      const textContent = extractContent(m.content);

      const contentParts: Array<TextPart | ToolCallPart> = [];

      if (m.metadata?.toolCalls) {
        for (const tc of m.metadata.toolCalls) {
          contentParts.push({
            type: 'tool-call' as const,
            toolCallId: tc.toolCallId || `tc_${m.id}`,
            toolName: tc.toolName,
            args: { query: String((tc.args as Record<string, unknown>)?.query ?? '') },
            result: tc.result,
          });
        }
      } else if (m.role === 'assistant' && m.metadata?.intent && m.metadata.searchResults?.length) {
        const toolName = INTENT_TO_TOOL[m.metadata.intent];
        if (toolName) {
          contentParts.push({
            type: 'tool-call' as const,
            toolCallId: `tc_legacy_${m.id}`,
            toolName,
            args: { query: '' },
            result: { results: m.metadata.searchResults },
          });
        }
      }

      contentParts.push({ type: 'text' as const, text: textContent });

      const custom: Record<string, unknown> = {};
      if (m.metadata?.senderId) {
        custom.senderId = m.metadata.senderId;
        custom.senderName = m.metadata.senderName ?? null;
      }
      if (m.metadata?.roleName) custom.roleName = m.metadata.roleName;
      if (m.metadata?.interrupted) custom.interrupted = true;
      if (m.metadata?.citations) custom.citations = m.metadata.citations;
      // Keep in step with PASSTHROUGH_METADATA_FIELDS in
      // runtime/threadMessageConversion.ts — that is the same contract, written
      // out as a list with a guard test; this converter states it by hand and
      // has drifted from it before. A field the live stream writes onto `custom`
      // but this loop does not rebuild renders once and then vanishes on the
      // next thread switch, silently and only on mobile.
      if (m.metadata?.searchImages) custom.searchImages = m.metadata.searchImages;
      if (m.metadata?.generatedImage) custom.generatedImage = m.metadata.generatedImage;
      if (m.metadata?.intent || m.metadata?.traceId)
        custom.streamMetadata = {
          intent: m.metadata.intent ?? 'direct',
          searchCount: m.metadata.searchCount ?? 0,
          ...(m.metadata.traceId && { traceId: m.metadata.traceId }),
        };

      return {
        role: m.role as 'user' | 'assistant',
        content: contentParts,
        id: m.id,
        metadata: Object.keys(custom).length > 0 ? { custom } : undefined,
      };
    });
}

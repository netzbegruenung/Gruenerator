// Pure message-shape conversion, deliberately free of any assistant-ui *runtime*
// import. The only assistant-ui reference is the `ThreadMessageLike` TYPE, which
// is erased at build time — so this module carries zero runtime weight and can
// be imported from the eager graph (e.g. the package barrel re-export) without
// dragging the assistant-ui runtime chunk back onto the initial load. The heavy
// runtime lives in GrueneratorChatRuntime.tsx and is loaded lazily.

import { type ThreadMessageLike } from '@assistant-ui/react';
import { INTENT_TO_TOOL } from '../lib/toolMappings';
import { coerceSharepicVariants } from '../hooks/useChatGraphStream';
import type { GeneratedImage, Citation, SearchResult } from '../hooks/useChatGraphStream';

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
  metadata?: {
    intent?: string;
    searchCount?: number;
    citations?: Citation[];
    searchResults?: SearchResult[];
    generatedImage?: GeneratedImage;
    toolCalls?: PersistedToolCall[];
    senderId?: string;
    senderName?: string | null;
    roleName?: string;
  };
}

function extractContent(content: unknown): string {
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

export function convertToThreadMessageLike(messages: LoadedMessage[]): ThreadMessageLike[] {
  return messages.map((m) => {
    const textContent = extractContent(m.content);

    type ToolCallLike = {
      readonly type: 'tool-call';
      readonly toolCallId: string;
      readonly toolName: string;
      readonly args: Record<string, string>;
      readonly result?: unknown;
    };

    const contentParts: Array<{ type: 'text'; text: string } | ToolCallLike> = [];

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
    if (m.metadata?.citations) custom.citations = m.metadata.citations;
    if (m.metadata?.generatedImage) custom.generatedImage = m.metadata.generatedImage;

    // Reconstruct the sharepic variant stack on reload. The live stream sets
    // custom.sharepicData from the 'sharepic_complete' SSE event; without this the
    // persisted sharepic tool call survives in metadata but the variant cards
    // vanish when the thread is reloaded (AssistantMessage renders custom.sharepicData).
    const sharepicCall = m.metadata?.toolCalls?.find((tc) => tc.toolName === 'sharepic');
    const sharepicVariants = (sharepicCall?.result as { variants?: unknown } | undefined)?.variants;
    // Validate on reload the same way the live stream does — drop any persisted
    // variant with a non-canonical canvasType so the studio handoff stays safe.
    const validSharepicVariants = coerceSharepicVariants(sharepicVariants);
    if (validSharepicVariants) {
      custom.sharepicData = { variants: validSharepicVariants };
    }

    // Reconstruct reel cards on reload (same mechanism as sharepicData): the
    // live stream sets these from the reel_processing / reel_picker SSE
    // events; the persisted tool results carry the identical payloads.
    const reelProcessingCall = m.metadata?.toolCalls?.find(
      (tc) => tc.toolName === 'reel_processing'
    );
    if (reelProcessingCall?.result) custom.reelProcessing = reelProcessingCall.result;
    const reelPickerCall = m.metadata?.toolCalls?.find((tc) => tc.toolName === 'reel_picker');
    const reelPickerProjects = (reelPickerCall?.result as { projects?: unknown } | undefined)
      ?.projects;
    if (Array.isArray(reelPickerProjects) && reelPickerProjects.length > 0) {
      custom.reelPicker = { projects: reelPickerProjects };
    }
    if (m.metadata?.intent)
      custom.streamMetadata = {
        intent: m.metadata.intent,
        searchCount: m.metadata.searchCount ?? 0,
      };

    return {
      role: m.role as 'user' | 'assistant',
      content: contentParts,
      id: m.id,
      metadata: Object.keys(custom).length > 0 ? { custom } : undefined,
    };
  });
}

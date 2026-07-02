// Pure message-shape conversion, deliberately free of any assistant-ui *runtime*
// import. The only assistant-ui reference is the `ThreadMessageLike` TYPE, which
// is erased at build time — so this module carries zero runtime weight and can
// be imported from the eager graph (e.g. the package barrel re-export) without
// dragging the assistant-ui runtime chunk back onto the initial load. The heavy
// runtime lives in GrueneratorChatRuntime.tsx and is loaded lazily.

import { type ThreadMessageLike } from '@assistant-ui/react';
import { INTENT_TO_TOOL } from '../lib/toolMappings';
import {
  coerceSharepicVariants,
  type ComputeData,
  type GeneratedImage,
  type Citation,
  type SearchResult,
} from '../hooks/useChatGraphStream';
import { type DocumentCreatedData } from '../types/messageMetadata';

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
    createdDocument?: DocumentCreatedData;
    computeData?: ComputeData;
    agentId?: string;
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

/**
 * Rich message metadata that must survive a thread reload — the reload half of
 * the live⇄reload contract. The live stream (parseSSEStream) accumulates these
 * onto `custom.*` as SSE events arrive; `buildCustomMetadata` below rebuilds the
 * identical `custom.*` from persisted metadata so a reloaded thread renders the
 * same as the live session.
 *
 * ── Invariant ───────────────────────────────────────────────────────────────
 * Every field `AssistantMessage` reads off `custom` must be reconstructable in
 * `buildCustomMetadata`. When you add a live custom field: PERSIST it (backend
 * `postResponseService` / `intentExecutionService`) and reconstruct it here.
 * For a 1:1 metadata→custom copy, just add its key to PASSTHROUGH_METADATA_FIELDS.
 * The regression test in `threadMessageConversion.vitest.ts` iterates this list
 * (and the tool-derived fields) and fails if a rich field is dropped on reload —
 * this is the guard that would have caught charts / createdDocument / agentId.
 */
export const PASSTHROUGH_METADATA_FIELDS = [
  'citations',
  'generatedImage',
  'createdDocument',
  'computeData',
  'agentId',
  'roleName',
] as const;

/**
 * Single seam: rebuild the `custom` render metadata from a persisted message.
 * Two kinds of field —
 *  - PASSTHROUGH_METADATA_FIELDS: verbatim metadata→custom copies.
 *  - tool-derived (sharepic / reel): extracted from persisted tool-call results
 *    with the same validation the live stream applies.
 * `senderId` and `streamMetadata` are special-cased (paired / derived).
 */
function buildCustomMetadata(metadata: LoadedMessage['metadata']): Record<string, unknown> {
  const custom: Record<string, unknown> = {};
  if (!metadata) return custom;

  // Sender identity travels as a pair.
  if (metadata.senderId) {
    custom.senderId = metadata.senderId;
    custom.senderName = metadata.senderName ?? null;
  }

  // Direct 1:1 passthroughs (see PASSTHROUGH_METADATA_FIELDS invariant above).
  // Truthy guard matches the historical per-field behaviour (skips ''/nullish).
  for (const field of PASSTHROUGH_METADATA_FIELDS) {
    const value = metadata[field];
    if (value) custom[field] = value;
  }

  // Tool-derived: sharepic variant stack. Validate on reload the same way the
  // live stream does — drop any variant with a non-canonical canvasType so the
  // studio handoff stays safe.
  const sharepicCall = metadata.toolCalls?.find((tc) => tc.toolName === 'sharepic');
  const validSharepicVariants = coerceSharepicVariants(
    (sharepicCall?.result as { variants?: unknown } | undefined)?.variants
  );
  if (validSharepicVariants) custom.sharepicData = { variants: validSharepicVariants };

  // Tool-derived: reel cards. The persisted tool results carry payloads
  // identical to the reel_processing / reel_picker SSE events.
  const reelProcessingCall = metadata.toolCalls?.find((tc) => tc.toolName === 'reel_processing');
  if (reelProcessingCall?.result) custom.reelProcessing = reelProcessingCall.result;
  const reelPickerProjects = (
    metadata.toolCalls?.find((tc) => tc.toolName === 'reel_picker')?.result as
      | { projects?: unknown }
      | undefined
  )?.projects;
  if (Array.isArray(reelPickerProjects) && reelPickerProjects.length > 0) {
    custom.reelPicker = { projects: reelPickerProjects };
  }

  // Derived: drives the message-action affordances (copy/regenerate context).
  if (metadata.intent) {
    custom.streamMetadata = { intent: metadata.intent, searchCount: metadata.searchCount ?? 0 };
  }

  return custom;
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

    const custom = buildCustomMetadata(m.metadata);

    return {
      role: m.role as 'user' | 'assistant',
      content: contentParts,
      id: m.id,
      metadata: Object.keys(custom).length > 0 ? { custom } : undefined,
    };
  });
}

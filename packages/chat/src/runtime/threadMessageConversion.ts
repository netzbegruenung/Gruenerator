// Pure message-shape conversion, deliberately free of any assistant-ui *runtime*
// import. The only assistant-ui reference is the `ThreadMessageLike` TYPE, which
// is erased at build time — so this module carries zero runtime weight and can
// be imported from the eager graph (e.g. the package barrel re-export) without
// dragging the assistant-ui runtime chunk back onto the initial load. The heavy
// runtime lives in GrueneratorChatRuntime.tsx and is loaded lazily.

import { type ThreadMessageLike } from '@assistant-ui/react';
import { socialPostPayloadSchema, bahnPayloadSchema } from '@gruenerator/contracts';

import {
  coerceSharepicVariants,
  type ComputeData,
  type GeneratedImage,
  type Citation,
  type SearchImage,
  type SearchResult,
} from '../hooks/useChatGraphStream';
import { isPastedTextAttachment, PASTED_TEXT_PREVIEW_PART_NAME } from '../lib/pastedText';
import { INTENT_TO_TOOL } from '../lib/toolMappings';
import { type DocumentCreatedData } from '../types/messageMetadata';

interface PersistedToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  /** Character index into the final answer text at this tool call's start —
   *  present only for unified-mode turns. When at least one tool call carries a
   *  numeric offset, reload interleaves text segments and cards in live order;
   *  absent (legacy / split turns) keeps the cards-first layout. */
  textOffset?: number;
  /** Planner announcement sentence(s) that preceded this tool call (split mode).
   *  Rendered as muted text above the card on reload — the durable counterpart
   *  of the live gather_narration status line. Absent on pre-rollout turns. */
  narration?: string;
}

export interface LoadedMessage {
  id: string;
  role: string;
  content: string;
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    preview: string;
    truncated: boolean;
  }>;
  metadata?: {
    intent?: string;
    searchCount?: number;
    traceId?: string;
    citations?: Citation[];
    searchResults?: SearchResult[];
    /** Web-search image hits. The proxy handle on each is minted at LOAD time by
     *  the backend, not stored — see `messagesController`. */
    searchImages?: SearchImage[];
    generatedImage?: GeneratedImage;
    createdDocument?: DocumentCreatedData;
    computeData?: ComputeData;
    agentId?: string;
    toolCalls?: PersistedToolCall[];
    senderId?: string;
    senderName?: string | null;
    roleName?: string;
    /** Stamped by messagesController when the row is still status='streaming'
     *  after request end — i.e. the turn was interrupted (crash/abort). */
    interrupted?: boolean;
  };
}

/**
 * `[cite:N]` → `[N]`, the reload half of a normalisation both live paths
 * already perform on arrival (`parseSSEStream.ts`, `NotebookModelAdapter.ts`).
 *
 * The notebook flow persists its answer with the `[cite:N]` tokens still in the
 * text (`notebookStreamController` stores `result.answer` verbatim), so without
 * this every reloaded notebook thread rendered its markers as literal
 * `[cite:5]` prose — the badge layer only ever matched `[N]`. Same visible
 * defect as a stray bracket beside a real badge, just triggered by reloading
 * instead of by marker syntax.
 */
function normalizeCitationMarkers(text: string): string {
  return text.replace(/\[cite:(\d+)\]/g, '[$1]');
}

function extractContent(content: unknown): string {
  if (typeof content !== 'string') return '';

  if (content.startsWith('[{') && content.includes('"type":"text"')) {
    try {
      const parts = JSON.parse(content);
      if (Array.isArray(parts)) {
        return normalizeCitationMarkers(
          parts
            .filter(
              (p: unknown): p is { type: string; text: string } =>
                p !== null &&
                typeof p === 'object' &&
                'type' in p &&
                p.type === 'text' &&
                'text' in p
            )
            .map((p) => p.text)
            .join('')
        );
      }
    } catch {
      // Not valid JSON, return as-is
    }
  }

  return normalizeCitationMarkers(content);
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
  'searchImages',
  'generatedImage',
  'createdDocument',
  'computeData',
  'agentId',
  'roleName',
  'interrupted',
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

  // Tool-derived: EXPERIMENTAL combined social post (text half). Validate on
  // reload the same way the live stream's Zod wire schema does; the persisted
  // result additionally carries `versions`, which the head schema ignores.
  const socialPostCall = metadata.toolCalls?.find((tc) => tc.toolName === 'social_post');
  if (socialPostCall?.result) {
    const parsedPost = socialPostPayloadSchema.safeParse(socialPostCall.result);
    if (parsedPost.success) custom.socialPostData = parsedPost.data;
  }

  // Tool-derived: Deutsche-Bahn departure board. The condensed timetable a
  // `bahn__*` loop step returned as its result IS the BahnPayload the live
  // `bahn` SSE event carried. The LAST step that PARSES wins (freshest board) —
  // not merely the last bahn__ step: the prompt instructs a raw
  // get_full_timetable_changes call AFTER the condensed timetable, which must
  // not shadow the board on reload.
  for (const tc of [...(metadata.toolCalls ?? [])].reverse()) {
    if (!tc.toolName.startsWith('bahn__')) continue;
    const bahnContent = (tc.result as { content?: unknown } | undefined)?.content;
    if (typeof bahnContent !== 'string') continue;
    try {
      const parsedBahn = bahnPayloadSchema.safeParse(JSON.parse(bahnContent));
      if (parsedBahn.success) {
        custom.bahnData = parsedBahn.data;
        break;
      }
    } catch {
      /* raw (non-condensed) tool result — keep looking */
    }
  }

  // Tool-derived: reel cards. The persisted tool results carry payloads
  // identical to the reel_processing / reel_picker SSE events.
  const reelProcessingCall = metadata.toolCalls?.find((tc) => tc.toolName === 'reel_processing');
  if (reelProcessingCall?.result) custom.reelProcessing = reelProcessingCall.result;
  const reelPickerProjects = (
    metadata.toolCalls?.find((tc) => tc.toolName === 'reel_picker')?.result as
      { projects?: unknown } | undefined
  )?.projects;
  if (Array.isArray(reelPickerProjects) && reelPickerProjects.length > 0) {
    custom.reelPicker = { projects: reelPickerProjects };
  }

  // Derived: drives the message-action affordances (copy/regenerate context)
  // and the thumbs feedback button (traceId), so it must survive reload.
  if (metadata.intent || metadata.traceId) {
    custom.streamMetadata = {
      intent: metadata.intent ?? 'direct',
      searchCount: metadata.searchCount ?? 0,
      ...(metadata.traceId && { traceId: metadata.traceId }),
    };
  }

  return custom;
}

export function convertToThreadMessageLike(messages: LoadedMessage[]): ThreadMessageLike[] {
  return messages
    .filter(
      // An interrupted turn that never received a delta (crash before first
      // token) has nothing to show — dropping it beats an empty bubble. Rows
      // with partial text or tool cards render normally plus the marker.
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

      type ToolCallLike = {
        readonly type: 'tool-call';
        readonly toolCallId: string;
        readonly toolName: string;
        readonly args: Record<string, string>;
        readonly result?: unknown;
        readonly parentId?: string;
        readonly narration?: string;
      };

      const contentParts: Array<{ type: 'text'; text: string } | ToolCallLike> = [];

      const cardFor = (tc: PersistedToolCall, parentId: string): ToolCallLike => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId || `tc_${m.id}`,
        toolName: tc.toolName,
        args: { query: String((tc.args as Record<string, unknown>)?.query ?? '') },
        result: tc.result,
        parentId,
        ...(tc.narration ? { narration: tc.narration } : {}),
      });

      const toolCalls = m.metadata?.toolCalls;
      const hasOffsets = toolCalls?.some((tc) => typeof tc.textOffset === 'number') ?? false;

      if (toolCalls && hasOffsets) {
        // Interleaved reload (Stufe 2): mirror the live buildResult layout by
        // slicing the answer text at each tool call's recorded offset. Sort by
        // offset (stable on ties via original index) and stamp parentId run-groups
        // — two cards belong to the same run when no non-empty text lies between
        // their offsets. A trailing text part is always appended (even empty), to
        // match the live tail behaviour.
        const sorted = toolCalls
          .map((tc, i) => ({ tc, i }))
          .sort((a, b) => (a.tc.textOffset ?? 0) - (b.tc.textOffset ?? 0) || a.i - b.i)
          .map((x) => x.tc);

        let cursor = 0;
        let runParentId: string | null = null;
        let prevWasCard = false;
        for (const tc of sorted) {
          const offset = Math.max(cursor, Math.min(tc.textOffset ?? cursor, textContent.length));
          const slice = textContent.slice(cursor, offset);
          if (slice.length > 0) {
            contentParts.push({ type: 'text' as const, text: slice });
            prevWasCard = false;
          }
          const toolCallId = tc.toolCallId || `tc_${m.id}`;
          const parentId: string = prevWasCard && runParentId ? runParentId : toolCallId;
          runParentId = parentId;
          contentParts.push(cardFor(tc, parentId));
          prevWasCard = true;
          cursor = offset;
        }
        contentParts.push({ type: 'text' as const, text: textContent.slice(cursor) });
      } else {
        // Legacy / split turns: cards first, then the full text — unchanged.
        if (toolCalls) {
          for (const tc of toolCalls) {
            contentParts.push({
              type: 'tool-call' as const,
              toolCallId: tc.toolCallId || `tc_${m.id}`,
              toolName: tc.toolName,
              args: { query: String((tc.args as Record<string, unknown>)?.query ?? '') },
              result: tc.result,
              ...(tc.narration ? { narration: tc.narration } : {}),
            });
          }
        } else if (
          m.role === 'assistant' &&
          m.metadata?.intent &&
          m.metadata.searchResults?.length
        ) {
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
      }

      const custom = buildCustomMetadata(m.metadata);
      const attachments = (m.attachments ?? [])
        .filter((attachment) => isPastedTextAttachment(attachment.name, attachment.contentType))
        .map((attachment) => ({
          id: attachment.id,
          type: 'document' as const,
          name: attachment.name,
          contentType: attachment.contentType,
          // This is display-only history data. The model adapter ignores data
          // parts, while the backend re-injects persisted attachments itself.
          content: [
            {
              type: 'data' as const,
              name: PASTED_TEXT_PREVIEW_PART_NAME,
              data: { text: attachment.preview, truncated: attachment.truncated },
            },
          ],
          status: { type: 'complete' as const },
        }));

      return {
        role: m.role as 'user' | 'assistant',
        content: contentParts,
        id: m.id,
        ...(attachments.length > 0 ? { attachments } : {}),
        metadata: Object.keys(custom).length > 0 ? { custom } : undefined,
      };
    });
}

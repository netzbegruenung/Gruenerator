// Pure message-shape conversion, deliberately free of any assistant-ui *runtime*
// import. The only assistant-ui reference is the `ThreadMessageLike` TYPE, which
// is erased at build time — so this module carries zero runtime weight and can
// be imported from the eager graph (e.g. the package barrel re-export) without
// dragging the assistant-ui runtime chunk back onto the initial load. The heavy
// runtime lives in GrueneratorChatRuntime.tsx and is loaded lazily.

import { type ThreadMessageLike, type ToolCallMessagePart } from '@assistant-ui/react';
import { socialPostPayloadSchema, bahnPayloadSchema } from '@gruenerator/contracts';

import {
  coerceSharepicVariants,
  type ComputeData,
  type GeneratedImage,
  type Citation,
  type SearchImage,
  type SearchResult,
} from '../hooks/useChatGraphStream';
import { ATTACHMENT_META_PART_NAME, type AttachmentMetaData } from '../lib/attachmentMeta';
import { mapRawCitationsToChat } from '../lib/citationUtils';
import { isPastedTextAttachment, PASTED_TEXT_PREVIEW_PART_NAME } from '../lib/pastedText';
import { TOOL_APPROVAL_OPTIONS } from '../lib/toolApproval';
import { INTENT_TO_TOOL } from '../lib/toolMappings';
import { type DocumentCreatedData } from '../types/messageMetadata';

interface PersistedToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  /** Present (and false) only when the call failed — see PersistedStep.ok. */
  ok?: false;
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
  /** ISO timestamp of the persisted row (`chat_messages.created_at`). */
  createdAt?: string;
  attachments?: Array<{
    id: string;
    name: string;
    contentType: string;
    preview: string;
    truncated: boolean;
    /** Real file size in bytes (`size_bytes`) — absent on legacy responses. */
    size?: number;
    /** OCR page count (PDFs only) — absent for images and legacy rows. */
    pageCount?: number;
  }>;
  metadata?: {
    intent?: string;
    searchCount?: number;
    traceId?: string;
    citations?: Citation[];
    /** Notebook answers only: the collection/document entries the answer drew
     *  on, persisted beside the citations and read by the sources panel. */
    sources?: unknown[];
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
    /** Rezept-Attribution des Turns (siehe `StreamMetadata.recipesUsed`). */
    recipesUsed?: { mention: string; title: string; source?: 'system' | 'user' }[];
    /** Werkzeugaufrufe, die auf eine Freigabe warten (oder gewartet haben).
     *  Solange `resolved` falsch ist, zeigt der Thread nach einem Reload wieder
     *  die Karte und kann entschieden werden. */
    pendingApproval?: {
      approvalTurnId: string;
      calls: Array<{
        toolCallId: string;
        toolName: string;
        args?: Record<string, unknown>;
        title?: string;
        serverName?: string;
      }>;
      resolved?: boolean | 'expired';
    };
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
 *
 * ── Eine bewusste Ausnahme ──────────────────────────────────────────────────
 * `custom.evidenceWeak` (#3140) steht NICHT in dieser Liste und überlebt einen
 * Reload nicht. Das bricht die Invariante mit Absicht: persistieren hiesse,
 * eine PROVISORISCHE Schwelle in die Datenbank zu schreiben, und der Schalter
 * `NOTEBOOK_EVIDENCE_WEAK_ENABLED` ist noch aus. Nicht „reparieren", ohne die
 * offene Frage 1 der Spec entschieden zu haben.
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
      // Rezept-Attribution — reload half of the live `done.metadata.recipesUsed`.
      ...(metadata.recipesUsed?.length ? { recipesUsed: metadata.recipesUsed } : {}),
    };
  }

  return custom;
}

/**
 * The reload half of the notebook conversation, mirroring what
 * `NotebookModelAdapter` builds live and `useNotebookChatBridge` rebuilds from
 * the local cache. Kept separate from `convertToThreadMessageLike` because the
 * two answer different questions: the chat path infers what a row is from its
 * metadata, while here every assistant row is known to be a notebook answer.
 *
 * Citations arrive raw (snake_case, as the backend stored them) and are mapped
 * to the shape the badge and sources layers read. `question` has no persisted
 * home of its own — the Word export takes it as the document heading — so it is
 * recovered from the user message the answer replied to.
 */
export function convertNotebookLoadedMessages(messages: LoadedMessage[]): ThreadMessageLike[] {
  /**
   * The question an answer replied to: the nearest preceding user row, not
   * simply the row before. An answer can end up without its question —
   * `notebookStreamController` persists the two separately, keeps the answer
   * when the question's write fails, and writes no question row at all when the
   * text is empty. Reading `idx - 1` blindly would then hand the next answer
   * the *previous answer's* text as its heading.
   */
  const questionFor = (idx: number): string => {
    for (let i = idx - 1; i >= 0; i--) {
      const row = messages[i]!;
      if (row.role !== 'assistant') return extractContent(row.content);
    }
    return '';
  };

  return messages.map((m, idx) => {
    const text = extractContent(m.content);
    if (m.role !== 'assistant') {
      return { role: 'user' as const, content: [{ type: 'text' as const, text }], id: m.id };
    }

    // `citations` is one metadata key written by two different producers: the
    // chat path stores them already mapped, the notebook path stores the raw
    // snake_case records its retrieval returned. On a notebook thread it is
    // always the latter, and mapping is what turns them into badges.
    const rawCitations = (m.metadata?.citations ?? []) as unknown[];
    const custom: Record<string, unknown> = {
      citations: mapRawCitationsToChat(rawCitations),
      rawCitations,
      sources: m.metadata?.sources ?? [],
      question: questionFor(idx),
      // Reload half of the thumbs feedback: the buttons only show when the
      // trace id is here, the same shape NotebookModelAdapter builds live.
      ...(m.metadata?.traceId
        ? {
            streamMetadata: {
              intent: 'direct',
              searchCount: 0,
              traceId: m.metadata.traceId,
            },
          }
        : {}),
    };

    return {
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text }],
      id: m.id,
      metadata: { custom },
    };
  });
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
        readonly args: ToolCallMessagePart['args'];
        readonly result?: unknown;
        readonly parentId?: string;
        readonly narration?: string;
        readonly approval?: ToolCallMessagePart['approval'];
        readonly title?: string;
        readonly serverName?: string;
      };

      const contentParts: Array<{ type: 'text'; text: string } | ToolCallLike> = [];

      const cardFor = (tc: PersistedToolCall, parentId: string): ToolCallLike => ({
        type: 'tool-call' as const,
        toolCallId: tc.toolCallId || `tc_${m.id}`,
        toolName: tc.toolName,
        args: { query: String((tc.args as Record<string, unknown>)?.query ?? '') },
        // Live, parseSSEStream folds `ok` into `result`; do the same here so a
        // reloaded card reaches the identical shape and reports the identical
        // outcome. Without this a failed call reloads as a green tick.
        result:
          tc.ok === false && tc.result && typeof tc.result === 'object'
            ? { ...(tc.result as Record<string, unknown>), ok: false }
            : tc.result,
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

      // Offene Werkzeug-Freigaben überleben den Reload: die Karte kommt zurück
      // und bleibt entscheidbar. Die vollen Übergabewerte bleiben hier stehen —
      // wer freigibt, muss sehen, was übergeben wird (die normalen Karten oben
      // führen bewusst nur `query`).
      const pending = m.metadata?.pendingApproval;
      const pendingUnresolved = pending && pending.resolved !== true;
      if (pendingUnresolved) {
        for (const call of pending.calls) {
          contentParts.push({
            type: 'tool-call' as const,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            // Aus der Datenbank gelesenes JSON — die Form ist JSON-tauglich,
            // der Typ der gespeicherten Metadaten ist nur weiter gefasst.
            args: (call.args ?? {}) as ToolCallMessagePart['args'],
            approval: {
              id: call.toolCallId,
              options: TOOL_APPROVAL_OPTIONS,
              ...(pending.resolved === 'expired' ? { resolution: 'expired' as const } : {}),
            },
            // Wie im Live-Pfad: die Karte nennt den Dienst, nicht den
            // Katalognamen.
            ...(call.title != null && { title: call.title }),
            ...(call.serverName != null && { serverName: call.serverName }),
          });
        }
      }

      const custom = buildCustomMetadata(m.metadata);
      // All persisted attachments come back as display-only history data — the
      // model adapter ignores data parts, while the backend re-injects
      // persisted attachments itself. Pasted text keeps its dedicated preview
      // part (card UI); every other file becomes a metadata chip (name, size,
      // page count, extracted-text preview) — the bytes are not persisted.
      const attachments = (m.attachments ?? []).map((attachment) => {
        if (isPastedTextAttachment(attachment.name, attachment.contentType)) {
          return {
            id: attachment.id,
            type: 'document' as const,
            name: attachment.name,
            contentType: attachment.contentType,
            content: [
              {
                type: 'data' as const,
                name: PASTED_TEXT_PREVIEW_PART_NAME,
                data: { text: attachment.preview, truncated: attachment.truncated },
              },
            ],
            status: { type: 'complete' as const },
          };
        }
        const meta: AttachmentMetaData = {
          ...(attachment.size != null ? { size: attachment.size } : {}),
          ...(attachment.pageCount != null ? { pageCount: attachment.pageCount } : {}),
          ...(attachment.preview
            ? { preview: attachment.preview, truncated: attachment.truncated }
            : {}),
        };
        return {
          id: attachment.id,
          type: attachment.contentType.startsWith('image/')
            ? ('image' as const)
            : ('document' as const),
          name: attachment.name,
          contentType: attachment.contentType,
          content: [{ type: 'data' as const, name: ATTACHMENT_META_PART_NAME, data: meta }],
          status: { type: 'complete' as const },
        };
      });

      // Without this, reloaded threads all get stamped "now" by the runtime and
      // the day separators collapse onto the reload moment.
      const createdAt = m.createdAt ? new Date(m.createdAt) : null;

      return {
        role: m.role as 'user' | 'assistant',
        content: contentParts,
        id: m.id,
        // Ohne `requires-action` verweigert assistant-ui die Antwort auf eine
        // Freigabe — die Karte wäre nach einem Reload nur noch Dekoration.
        ...(pendingUnresolved && pending?.resolved !== 'expired'
          ? { status: { type: 'requires-action' as const, reason: 'tool-calls' as const } }
          : {}),
        ...(createdAt && !Number.isNaN(createdAt.getTime()) ? { createdAt } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
        metadata: Object.keys(custom).length > 0 ? { custom } : undefined,
      };
    });
}

import { getSystemAgent } from '@gruenerator/shared/agents';

import { parseAllMentions } from '../../lib/mentionParser';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { useAgentStore } from '../../stores/chatStore';
import { useDocumentChatStore } from '../../stores/documentChatStore';
import { useReelLiveStore } from '../../stores/reelLiveStore';
import { useSharepicLiveStore } from '../../stores/sharepicLiveStore';
import { REEL_UPLOAD_PART_NAME, type ReelUploadData } from '../GrueneratorAttachmentAdapter';
import { streamErrorMessage } from '../streamErrorMessage';

import { getClientToolExecutor } from '../clientTools';

import { buildRequestBody } from './buildRequestBody';
import { parseSSEStream } from './parseSSEStream';
import { truncateAttachmentContext } from './truncation';

import type {
  ExtractedAttachment,
  FormattedMessage,
  InjectedCurrentDocument,
} from './buildRequestBody';
import type {
  GrueneratorAdapterConfig,
  GrueneratorAdapterCallbacks,
  StreamOutcome,
  ToolCallPart,
} from './types';
import type { ThreadMode } from '../../stores/chatStore';
import type { CurrentBoard } from '@gruenerator/contracts';
import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  CompleteAttachment,
} from '@assistant-ui/react';

export type {
  GrueneratorMessageMetadata,
  GrueneratorAdapterConfig,
  GrueneratorAdapterCallbacks,
} from './types';

// Bounded like OpenWebUI's code-interpreter loop: the backend currently issues
// at most one client_tool interrupt per turn, but a misbehaving server must
// never be able to keep the browser executing forever.
const MAX_CLIENT_TOOL_ROUNDS = 3;

/**
 * Run-then-answer continuation: while the stream ended in a `client_tool`
 * interrupt, execute the tool locally (clientTools registry) and resume the
 * turn with the result — the backend streams the final answer, which we keep
 * yielding into the SAME assistant message. Returns the outcome of the last
 * stream (with indexedDocumentIds accumulated across rounds).
 */
async function* runClientToolResumes(params: {
  outcome: StreamOutcome;
  fallbackThreadId: string | null;
  callbacks: GrueneratorAdapterCallbacks;
  agentInfo?: { agentId: string; agentMention?: string } | undefined;
  abortSignal?: AbortSignal | undefined;
}): AsyncGenerator<ChatModelRunResult, StreamOutcome, void> {
  let current = params.outcome;
  let rounds = 0;

  while (current.clientToolInterrupt && rounds < MAX_CLIENT_TOOL_ROUNDS) {
    rounds++;
    const { toolName, args, threadId: interruptThreadId } = current.clientToolInterrupt;
    const threadId = interruptThreadId ?? params.fallbackThreadId;
    const execute = getClientToolExecutor(toolName);
    if (!execute || !threadId) {
      console.warn(`[ModelAdapter] Cannot resume client tool "${toolName}" — skipping`);
      break;
    }

    let result: unknown;
    try {
      result = await execute(args);
    } catch (err) {
      result = { error: err instanceof Error ? err.message : String(err) };
    }

    // Carry the turn's tool-call parts into the resumed stream (so the
    // run_python card survives), marking the executed tool as completed.
    const priorToolCalls = (current.lastResult?.content ?? [])
      .filter((p): p is ToolCallPart => (p as { type?: string }).type === 'tool-call')
      .map((tc) => (tc.toolName === toolName && tc.result == null ? { ...tc, result } : tc));

    const { fetch: configFetch, endpoints } = useChatConfigStore.getState();
    const resumeResponse = await configFetch(endpoints.chatResume, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, toolName, result }),
      signal: params.abortSignal,
    });
    if (!resumeResponse.ok) {
      const errorData = await resumeResponse.json().catch(() => ({}));
      throw new Error(
        (errorData as { error?: string }).error || `HTTP error ${resumeResponse.status}`
      );
    }

    const nextOutcome: StreamOutcome = { interrupted: false, indexedDocumentIds: [] };
    yield* parseSSEStream(resumeResponse, params.callbacks, nextOutcome, params.agentInfo, {
      toolCalls: priorToolCalls,
    });
    nextOutcome.indexedDocumentIds = [
      ...current.indexedDocumentIds,
      ...nextOutcome.indexedDocumentIds,
    ];
    current = nextOutcome;
  }

  return current;
}

export function createGrueneratorModelAdapter(
  getConfig: () => GrueneratorAdapterConfig,
  callbacks: GrueneratorAdapterCallbacks
): ChatModelAdapter {
  // Tracks which thread has a pending HITL interrupt — persists across run() calls
  let interruptedThreadId: string | null = null;
  let lastInterruptedResult: ChatModelRunResult | null = null;

  return {
    async *run(options: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void> {
      const { messages, abortSignal } = options;
      const config = getConfig();

      // unstable_getMessage() provides the current assistant message (not in messages array).
      // This is where addResult() writes the user's answer for human tool calls.
      const currentAssistant = options.unstable_getMessage?.();

      // Resume detection via unstable_getMessage() — the canonical way to read addResult() answers.
      // assistant-ui writes the result onto the current assistant message, NOT into messages[].
      if (currentAssistant) {
        const askHumanResult = currentAssistant.content?.find(
          (p) =>
            p.type === 'tool-call' &&
            p.toolName === 'ask_human' &&
            'result' in p &&
            typeof p.result === 'string' &&
            (p.result as string).length > 0
        );
        if (askHumanResult && askHumanResult.type === 'tool-call') {
          const answer = String(askHumanResult.result);
          interruptedThreadId = null;
          lastInterruptedResult = null;
          const { fetch: configFetch, endpoints } = useChatConfigStore.getState();
          const resumeResponse = await configFetch(endpoints.chatResume, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              threadId: config.threadId,
              resume: answer,
            }),
            signal: abortSignal,
          });

          if (!resumeResponse.ok) {
            const errorData = await resumeResponse.json().catch(() => ({}));
            throw new Error(
              (errorData as { error?: string }).error || `HTTP error ${resumeResponse.status}`
            );
          }

          let resumeOutcome: StreamOutcome = { interrupted: false, indexedDocumentIds: [] };
          yield* parseSSEStream(
            resumeResponse,
            callbacks,
            resumeOutcome,
            config.agentId ? { agentId: config.agentId } : undefined
          );
          if (resumeOutcome.clientToolInterrupt) {
            resumeOutcome = yield* runClientToolResumes({
              outcome: resumeOutcome,
              fallbackThreadId: config.threadId,
              callbacks,
              agentInfo: config.agentId ? { agentId: config.agentId } : undefined,
              abortSignal,
            });
          }
          if (resumeOutcome.interrupted) {
            interruptedThreadId = config.threadId;
            lastInterruptedResult = resumeOutcome.lastResult ?? null;
          }
          return;
        }

        // Current assistant has pending ask_human without result — spurious re-invocation.
        const pendingAskHuman = currentAssistant.content?.find(
          (p) =>
            p.type === 'tool-call' && p.toolName === 'ask_human' && !('result' in p && p.result)
        );
        if (pendingAskHuman) {
          console.warn('[ModelAdapter] BLOCKED — pending ask_human without answer');
          throw new DOMException('Aborted', 'AbortError');
        }
      }

      // Stateful guard: block re-invocation if we know this thread has a pending interrupt
      // (covers case where unstable_getMessage returns undefined after history rehydration)
      if (interruptedThreadId && interruptedThreadId === config.threadId) {
        console.warn('[ModelAdapter] BLOCKED — thread has pending interrupt');
        throw new DOMException('Aborted', 'AbortError');
      }

      // Clear stale interrupt if switching to a different thread
      if (interruptedThreadId && interruptedThreadId !== config.threadId) {
        interruptedThreadId = null;
        lastInterruptedResult = null;
      }

      const formattedMessages: FormattedMessage[] = messages.map((m) => {
        const parts: Array<
          | { type: 'text'; text: string }
          | { type: 'image'; image: string }
          | { type: 'file'; name: string; mimeType: string; data: string }
        > = [];

        for (const part of m.content) {
          if (part.type === 'text') {
            parts.push({ type: 'text', text: part.text });
          } else if (part.type === 'image') {
            parts.push({ type: 'image', image: part.image });
          } else if (part.type === 'file') {
            parts.push({
              type: 'file',
              name: (part as { name?: string }).name ?? 'file',
              mimeType: (part as { mimeType?: string }).mimeType ?? 'application/octet-stream',
              data: (part as { data?: string }).data ?? '',
            });
          }
        }

        // Merge attachment content parts into formattedMessages so the backend
        // can also see them when inspecting the messages array directly.
        if (m.role === 'user' && 'attachments' in m) {
          const attachments = (m as { attachments: readonly CompleteAttachment[] }).attachments;
          for (const att of attachments) {
            for (const part of att.content) {
              if (part.type === 'text') {
                parts.push({ type: 'text', text: part.text });
              } else if (part.type === 'image') {
                parts.push({ type: 'image', image: part.image });
              } else if (part.type === 'file') {
                parts.push({
                  type: 'file',
                  name: att.name ?? 'file',
                  mimeType: (part as { mimeType?: string }).mimeType ?? 'application/octet-stream',
                  data: (part as { data?: string }).data ?? '',
                });
              }
            }
          }
        }

        if (parts.length === 0) {
          parts.push({ type: 'text', text: '' });
        }

        return { id: m.id, role: m.role, parts };
      });

      // Resolve effective mode: an agent with routeTo='search' forces 'search' mode
      // regardless of the store's threadMode (the agent IS the mode). Legacy
      // threadMode='search' without a search-agent collapses to 'chat' — the old
      // Suche toggle was removed, so the only path to SearchGraph is the agent.
      const activeAgentForRouting = config.agentId ? getSystemAgent(config.agentId) : null;
      const storedMode = config.threadMode || 'chat';
      const effectiveMode: ThreadMode =
        activeAgentForRouting?.routeTo === 'search'
          ? 'search'
          : storedMode === 'search'
            ? 'chat'
            : storedMode;

      // Surface tools (edit_current_doc) belong to the surface, not the agent —
      // but if the user picks a search-route agent, SearchGraph can't run them.
      // Strip the edit hook; keep save_as_doc, which is harmless.
      const safeCustomEnabledTools =
        activeAgentForRouting?.routeTo === 'search' && config.customEnabledTools
          ? Object.fromEntries(
              Object.entries(config.customEnabledTools).filter(([k]) => k !== 'edit_current_doc')
            )
          : config.customEnabledTools;

      // Skip attachment extraction and mention parsing for non-chat modes
      const isChatMode = effectiveMode === 'chat' || effectiveMode === 'eigener';

      // Extract attachments from AUI's CompleteAttachment objects on the last user message.
      // AUI stores file/image content in message.attachments[].content, NOT in message.content.
      const extractedAttachments: ExtractedAttachment[] = [];

      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      if (isChatMode && lastUserMsg && 'attachments' in lastUserMsg) {
        for (const attachment of lastUserMsg.attachments as unknown as Array<{
          name?: string;
          contentType?: string;
          content: Array<
            | { type: 'file'; data: string; mimeType: string }
            | { type: 'image'; image: string }
            | { type: string }
          >;
        }>) {
          for (const part of attachment.content) {
            if (part.type === 'file' && 'data' in part) {
              extractedAttachments.push({
                name: attachment.name || 'file',
                type: (part as { mimeType: string }).mimeType,
                size: Math.ceil(((part as { data: string }).data.length * 3) / 4),
                data: (part as { data: string }).data,
                isImage: false,
              });
            } else if (part.type === 'image' && 'image' in part) {
              const imageData = (part as { image: string }).image;
              const commaIdx = imageData.indexOf(',');
              const header = commaIdx > 0 ? imageData.slice(0, commaIdx) : '';
              const base64Data = commaIdx > 0 ? imageData.slice(commaIdx + 1) : imageData;
              const mimeMatch = header.match(/data:(.*?);/);
              extractedAttachments.push({
                name: attachment.name || 'image',
                type: mimeMatch?.[1] || 'image/jpeg',
                size: Math.ceil((base64Data.length * 3) / 4),
                data: base64Data,
                isImage: true,
              });
            }
          }
        }
      }

      // Extract @-mentions from the last user message for agent routing + notebook/document scoping
      // Only applies in chat mode — search and notebook modes don't use mentions
      let effectiveAgentId = config.agentId;
      let effectiveAgentMention: string | undefined;
      let notebookIds: string[] = [];
      let forcedTools: string[] = [];
      let documentIds: string[] = [];
      let textIds: string[] = [];
      let boardIds: string[] = [];
      let docMentionIds: string[] = [];
      let wolkeFiles: ReturnType<typeof parseAllMentions>['wolkeFiles'] = [];
      let connectFiles: ReturnType<typeof parseAllMentions>['connectFiles'] = [];
      let hasDocumentChat = false;
      if (isChatMode)
        for (let i = formattedMessages.length - 1; i >= 0; i--) {
          const msg = formattedMessages[i];
          if (msg.role !== 'user') continue;
          const textPart = msg.parts.find(
            (p): p is { type: 'text'; text: string } => p.type === 'text'
          );
          if (textPart) {
            const parsed = parseAllMentions(textPart.text);
            // Only override the URL/store-derived agent when the user actually
            // typed an @agent or /skill mention. parseAllMentions falls back to
            // getDefaultAgent() (universal) when no mention exists, which would
            // otherwise silently wipe ?agent=… deep links.
            if (parsed.agentMention !== undefined) {
              effectiveAgentId = parsed.agentId;
              effectiveAgentMention = parsed.agentMention;
            }
            notebookIds = parsed.notebookIds;
            forcedTools = parsed.forcedTools;
            documentIds = parsed.documentIds;
            textIds = parsed.textIds;
            boardIds = parsed.boardIds;
            docMentionIds = parsed.docMentionIds;
            wolkeFiles = parsed.wolkeFiles;
            connectFiles = parsed.connectFiles;
            hasDocumentChat = parsed.hasDocumentChat;
            textPart.text = parsed.cleanText;

            if (parsed.unresolvedMentions.length > 0) {
              const names = parsed.unresolvedMentions.map((m) => `@${m}`).join(', ');
              console.warn(
                `[ModelAdapter] Unresolved mentions: ${names} — use @docs to browse collaborative documents`
              );
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('gruenerator:unresolved-mentions', {
                    detail: { mentions: parsed.unresolvedMentions },
                  })
                );
              }
            }
          }
          break;
        }

      // Extract doc/document mentions from the user message's attachments
      // (the "tag" UX). Each picked doc was attached as an assistant-ui
      // CompleteAttachment with a `data` content part carrying our metadata.
      if (isChatMode && lastUserMsg && 'attachments' in lastUserMsg) {
        const seenDocs = new Set(documentIds);
        const seenTexts = new Set(textIds);
        const seenCollab = new Set(docMentionIds);
        const seenWolke = new Set(wolkeFiles.map((f) => `${f.shareLinkId}:${f.path}`));
        const seenConnect = new Set(connectFiles.map((f) => `${f.provider}:${f.fileId}`));
        type GruenMentionData =
          | { kind: 'collab'; id: string; slug: string; title: string }
          | {
              kind: 'document';
              documentId: string;
              sourceType: 'notebook' | 'document' | 'text';
            }
          | { kind: 'wolke'; shareLinkId: string; path: string; name: string }
          | { kind: 'connect'; provider: string; fileId: string; name: string; mimeType?: string };
        const attachments = (lastUserMsg as { attachments: readonly CompleteAttachment[] })
          .attachments;
        for (const att of attachments) {
          if (!att.contentType?.startsWith('application/x-gruenerator-')) continue;
          for (const part of att.content) {
            if (part.type !== 'data') continue;
            const dataPart = part as { type: 'data'; name?: string; data: GruenMentionData };
            if (dataPart.name !== 'gruenerator-mention') continue;
            const data = dataPart.data;
            if (data.kind === 'collab') {
              if (!seenCollab.has(data.id)) {
                seenCollab.add(data.id);
                docMentionIds.push(data.id);
              }
            } else if (data.kind === 'document') {
              if (data.sourceType === 'text') {
                if (!seenTexts.has(data.documentId)) {
                  seenTexts.add(data.documentId);
                  textIds.push(data.documentId);
                }
              } else {
                if (!seenDocs.has(data.documentId)) {
                  seenDocs.add(data.documentId);
                  documentIds.push(data.documentId);
                }
              }
            } else if (data.kind === 'wolke') {
              const key = `${data.shareLinkId}:${data.path}`;
              if (!seenWolke.has(key)) {
                seenWolke.add(key);
                wolkeFiles.push({
                  shareLinkId: data.shareLinkId,
                  path: data.path,
                  name: data.name,
                });
              }
            } else if (data.kind === 'connect') {
              const key = `${data.provider}:${data.fileId}`;
              if (!seenConnect.has(key)) {
                seenConnect.add(key);
                connectFiles.push({
                  provider: data.provider,
                  fileId: data.fileId,
                  name: data.name,
                  ...(data.mimeType ? { mimeType: data.mimeType } : {}),
                });
              }
            }
          }
        }
      }

      // Extract a composer-attached video's TUS upload result. The attachment
      // adapter completes video attachments as a synthetic data part (no
      // base64 content); the backend's reel branch starts auto-transcription.
      let extractedReelUpload: { uploadId: string; filename: string } | null = null;
      if (isChatMode && lastUserMsg && 'attachments' in lastUserMsg) {
        const attachments = (lastUserMsg as { attachments: readonly CompleteAttachment[] })
          .attachments;
        for (const att of attachments) {
          for (const part of att.content) {
            if (part.type !== 'data') continue;
            const dataPart = part as { type: 'data'; name?: string; data: ReelUploadData };
            if (dataPart.name !== REEL_UPLOAD_PART_NAME) continue;
            extractedReelUpload = {
              uploadId: dataPart.data.uploadId,
              filename: dataPart.data.filename,
            };
          }
        }
      }

      // Read thread-persisted documentChatIds for follow-up messages
      const dcStore = useDocumentChatStore.getState();
      const documentChatIds = dcStore.getForThread(config.threadId);

      const { fetch: configFetch, endpoints, contextProviders } = useChatConfigStore.getState();

      // Surface-injected context (e.g. docs editor markdown + selected text).
      // Keyed by threadId, so global chat threads and the docs thread coexist.
      let injectedDocIds: string[] = [];
      let injectedAttachmentContext: string | undefined;
      let injectedCurrentDocument: InjectedCurrentDocument | undefined;
      let injectedCurrentBoard: CurrentBoard | undefined;
      if (config.threadId) {
        const provider = contextProviders.get(config.threadId);
        if (provider) {
          try {
            const ctx = await provider();
            if (ctx.documentChatIds?.length) injectedDocIds = ctx.documentChatIds;
            if (ctx.currentDocument) {
              const cd = ctx.currentDocument;
              injectedCurrentDocument = {
                id: cd.id,
                title: cd.title ?? null,
                markdown: truncateAttachmentContext(cd.markdown, 80_000) ?? cd.markdown,
                selectionText: cd.selectionText ?? null,
              };
            }
            // Live board context (boards-editor surface). Required for the
            // classifier to route to edit_current_board and emit
            // trigger_board_action — without it the assistant only chats.
            if (ctx.currentBoard) injectedCurrentBoard = ctx.currentBoard;
            const parts: string[] = [];
            if (ctx.selectionText) parts.push(`## Auswahl:\n${ctx.selectionText}`);
            if (ctx.attachmentContext) parts.push(ctx.attachmentContext);
            const merged = parts.join('\n\n');
            // Cap at 80k chars to keep request bodies bounded.
            injectedAttachmentContext = merged
              ? truncateAttachmentContext(merged, 80_000)
              : undefined;
          } catch (err) {
            console.warn(
              '[ChatAdapter] contextProvider threw, continuing without injected context',
              err
            );
          }
        }
      }

      const mergedDocChatIds = injectedDocIds.length
        ? Array.from(new Set([...documentChatIds, ...injectedDocIds]))
        : documentChatIds;

      // Workplace flow seeds an Antrag/PM/Social text in agent store; pass it
      // along on the FIRST request (no threadId yet) so the backend persists
      // it as the seed assistant message of the brand-new thread.
      const seededInitialAssistantMessage = !config.threadId
        ? useAgentStore.getState().pendingInitialAssistantMessage || undefined
        : undefined;

      // Mode-aware endpoint selection (uses effectiveMode so search-routed agents
      // dispatch to SearchGraph regardless of the store's threadMode).
      const endpoint =
        effectiveMode === 'search'
          ? endpoints.searchStream
          : effectiveMode === 'notebook'
            ? endpoints.notebookStream
            : endpoints.chatStream;

      const requestBody = buildRequestBody({
        effectiveMode,
        formattedMessages,
        config,
        effectiveAgentId,
        safeCustomEnabledTools,
        extractedAttachments,
        notebookIds,
        forcedTools,
        documentIds,
        textIds,
        boardIds,
        docMentionIds,
        wolkeFiles,
        connectFiles,
        mergedDocChatIds,
        hasDocumentChat,
        injectedCurrentDocument,
        injectedCurrentBoard,
        injectedAttachmentContext,
        seededInitialAssistantMessage,
        currentSharepic: (() => {
          const active = useSharepicLiveStore.getState().activeVariant;
          if (!active) return null;
          const { variantId, canvasId, canvasType } = active;
          return { variantId, canvasId, canvasType };
        })(),
        currentReel: (() => {
          const active = useReelLiveStore.getState().activeReel;
          return active ? { projectId: active.projectId } : null;
        })(),
        reelUpload: extractedReelUpload,
      });

      let response: Response;
      try {
        response = await configFetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody),
          signal: abortSignal,
        });
      } catch (fetchError) {
        if (abortSignal?.aborted) return;
        yield { content: [{ type: 'text' as const, text: streamErrorMessage(fetchError) }] };
        return;
      }

      if (!response.ok) {
        yield { content: [{ type: 'text' as const, text: streamErrorMessage(null, response) }] };
        return;
      }

      let streamOutcome: StreamOutcome = { interrupted: false, indexedDocumentIds: [] };
      const resolvedAgentId = effectiveAgentId || config.agentId;
      const streamAgentInfo = resolvedAgentId
        ? { agentId: resolvedAgentId, agentMention: effectiveAgentMention }
        : undefined;
      try {
        yield* parseSSEStream(response, callbacks, streamOutcome, streamAgentInfo);

        // Run-then-answer: the backend paused this turn so the client executes
        // a tool (e.g. run_python via Pyodide); resume with the result and keep
        // streaming the final answer into the same message.
        if (streamOutcome.clientToolInterrupt) {
          streamOutcome = yield* runClientToolResumes({
            outcome: streamOutcome,
            fallbackThreadId: config.threadId,
            callbacks,
            agentInfo: streamAgentInfo,
            abortSignal,
          });
        }
      } catch (err) {
        // Mid-stream connection drop (proxy timeout, mobile blip, worker recycle)
        // surfaces as TypeError; treat it as a graceful end so it doesn't reach Sentry.
        if (
          err instanceof TypeError &&
          /network error|failed to fetch|load failed|error in input stream/i.test(err.message)
        ) {
          return;
        }
        // Other mid-stream errors (e.g. backend SSE `error` event) — surface
        // as an assistant message so the user sees what went wrong in-thread,
        // not just in the dev console.
        if (abortSignal?.aborted) return;
        yield { content: [{ type: 'text' as const, text: streamErrorMessage(err) }] };
        return;
      }

      // Persist server-indexed document IDs to thread for follow-up messages
      if (streamOutcome.indexedDocumentIds.length > 0 && config.threadId) {
        for (const docId of streamOutcome.indexedDocumentIds) {
          dcStore.addToThread(config.threadId, docId);
        }
      }

      if (streamOutcome.interrupted) {
        interruptedThreadId = config.threadId;
        lastInterruptedResult = streamOutcome.lastResult ?? null;
      }
    },
  };
}

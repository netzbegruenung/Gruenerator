import { useLastComputeStore } from '../../stores/lastComputeStore';
import { getAvailableClientTools } from '../clientTools';

import type { GrueneratorAdapterConfig } from './types';
import type { ThreadMode } from '../../stores/chatStore';
import type { parseAllMentions } from '../../lib/mentionParser';
import type { CurrentBoard } from '@gruenerator/contracts';

export type FormattedMessagePart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: string }
  | { type: 'file'; name: string; mimeType: string; data: string };

export interface FormattedMessage {
  id: string;
  role: string;
  parts: FormattedMessagePart[];
}

export interface ExtractedAttachment {
  name: string;
  type: string;
  size: number;
  data: string;
  isImage: boolean;
}

export interface InjectedCurrentDocument {
  id: string;
  title?: string | null;
  markdown: string;
  selectionText?: string | null;
}

export interface BuildRequestBodyParams {
  effectiveMode: ThreadMode;
  formattedMessages: FormattedMessage[];
  config: GrueneratorAdapterConfig;
  effectiveAgentId: string | null;
  safeCustomEnabledTools: Record<string, boolean> | null | undefined;
  extractedAttachments: ExtractedAttachment[];
  notebookIds: string[];
  forcedTools: string[];
  documentIds: string[];
  textIds: string[];
  boardIds: string[];
  sheetIds: string[];
  docMentionIds: string[];
  wolkeFiles: ReturnType<typeof parseAllMentions>['wolkeFiles'];
  connectFiles: ReturnType<typeof parseAllMentions>['connectFiles'];
  /** URLs attached via the @web mention (crawled through the scrape_url path). */
  webpageUrls: string[];
  /** Regenerate the last assistant turn (backend replaces instead of appends). */
  regenerate: boolean;
  /** DB id of the user message an edit-resubmit starts from, if any. */
  replaceFromMessageId: string | undefined;
  mergedDocChatIds: string[];
  hasDocumentChat: boolean;
  injectedCurrentDocument: InjectedCurrentDocument | undefined;
  /** Live board state (boards-editor surface), serialized from Yjs each request. */
  injectedCurrentBoard: CurrentBoard | undefined;
  injectedAttachmentContext: string | undefined;
  seededInitialAssistantMessage: string | undefined;
  /** Variant marked "active for chat editing" on a sharepic card, if any. */
  currentSharepic: {
    variantId: string;
    canvasId: string | null;
    canvasType: string;
  } | null;
  /** Social post marked "active for chat editing" (combined post card), if any. */
  currentSocialPost: { postId: string } | null;
  /** Subtitler project marked active for chat subtitle editing, if any. */
  currentReel: { projectId: string } | null;
  /** Composer-attached video, already TUS-uploaded (reel transcription). */
  reelUpload: { uploadId: string; filename: string } | null;
}

const lastUserText = (formattedMessages: FormattedMessage[]): string =>
  ((
    formattedMessages
      .filter((m) => m.role === 'user')
      .pop()
      ?.parts?.find((p) => p.type === 'text') as { text: string } | undefined
  )?.text ??
    '') ||
  '';

/**
 * Assemble the mode-aware request body for the chat backend. Each mode
 * (search / notebook / eigener / chat) ships a different field set; the shared
 * chat/eigener payload differs only in agentId + customSystemPrompt/roleName.
 */
export function buildRequestBody(params: BuildRequestBodyParams): Record<string, unknown> {
  const {
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
    sheetIds,
    docMentionIds,
    wolkeFiles,
    connectFiles,
    webpageUrls,
    regenerate,
    replaceFromMessageId,
    mergedDocChatIds,
    hasDocumentChat,
    injectedCurrentDocument,
    injectedCurrentBoard,
    injectedAttachmentContext,
    seededInitialAssistantMessage,
    currentSharepic,
    currentSocialPost,
    currentReel,
    reelUpload,
  } = params;

  if (effectiveMode === 'search') {
    // Search mode: simple query + searchMode, no mentions/attachments
    return {
      query: lastUserText(formattedMessages),
      messages: formattedMessages,
      threadId: config.threadId,
      searchMode: config.searchMode || 'web',
      agentId: config.agentId,
    };
  }

  if (effectiveMode === 'notebook') {
    // Notebook RAG: the /notebook/stream endpoint reads the question from
    // `messages` and scopes retrieval by collection id(s). The host resolves the
    // notebook→collection map into `selectedNotebookCollectionIds`; fall back to
    // the raw notebook id as a single collection (covers user-notebook UUIDs).
    const collectionIds = config.selectedNotebookCollectionIds;
    return {
      messages: formattedMessages,
      ...(collectionIds && collectionIds.length > 0
        ? { collectionIds }
        : { collectionId: config.selectedNotebookId || 'gruenerator-notebook' }),
      mode: config.notebookMode || 'fast',
      threadId: config.threadId,
    };
  }

  const sharedChatBody = {
    messages: formattedMessages,
    threadId: config.threadId,
    enabledTools: safeCustomEnabledTools
      ? { ...config.enabledTools, ...safeCustomEnabledTools }
      : config.enabledTools,
    modelId: config.modelId,
    attachments: extractedAttachments.length > 0 ? extractedAttachments : undefined,
    notebookIds: notebookIds.length > 0 ? notebookIds : undefined,
    forcedTools: forcedTools.length > 0 ? forcedTools : undefined,
    documentIds: documentIds.length > 0 ? documentIds : undefined,
    textIds: textIds.length > 0 ? textIds : undefined,
    boardIds: boardIds.length > 0 ? boardIds : undefined,
    sheetIds: sheetIds.length > 0 ? sheetIds : undefined,
    docMentionIds: docMentionIds.length > 0 ? docMentionIds : undefined,
    wolkeFiles: wolkeFiles.length > 0 ? wolkeFiles : undefined,
    connectFiles: connectFiles.length > 0 ? connectFiles : undefined,
    webpageUrls: webpageUrls.length > 0 ? webpageUrls : undefined,
    regenerate: regenerate || undefined,
    replaceFromMessageId: replaceFromMessageId || undefined,
    documentChatIds: mergedDocChatIds.length > 0 ? mergedDocChatIds : undefined,
    documentChatMode: hasDocumentChat || mergedDocChatIds.length > 0 || undefined,
    currentDocument: injectedCurrentDocument,
    currentBoard: injectedCurrentBoard,
    currentSharepic: currentSharepic ?? undefined,
    currentSocialPost: currentSocialPost ?? undefined,
    currentReel: currentReel ?? undefined,
    reelUpload: reelUpload ?? undefined,
    attachmentContext: injectedAttachmentContext,
    // Forward the last browser-computed spreadsheet result so the backend can
    // give it to the model as ground truth (formatComputedResultContext) — the
    // model can't see the client-side Pyodide output otherwise. Figures are
    // stripped: they were already persisted with the original turn, and
    // re-sending base64 PNGs would bloat every follow-up request.
    computedResult: (() => {
      const r = useLastComputeStore.getState().result;
      if (!r) return undefined;
      const { figures: _figures, files: _files, figureUrls: _fu, fileAssets: _fa, ...slim } = r;
      return slim;
    })(),
    // Declare which tools this client can execute locally, so the backend may
    // pause the turn with a client_tool interrupt (e.g. run_python) instead of
    // prompting the model to emit a code block.
    clientTools: (() => {
      const available = getAvailableClientTools();
      return available.length > 0 ? available : undefined;
    })(),
    defaultNotebookId: config.selectedNotebookId || undefined,
    customSystemPrompt: config.customSystemPrompt || undefined,
    initialAssistantMessage: seededInitialAssistantMessage,
    activeSkillMention: config.activeSkillMention || undefined,
  };

  if (effectiveMode === 'eigener') {
    // Eigener Chat mode: like chat but with custom prompt, no stale agentId
    return {
      ...sharedChatBody,
      agentId: null,
      roleName: config.customRoleName || undefined,
    };
  }

  // Chat mode: full request with mentions, attachments, tools
  return {
    ...sharedChatBody,
    agentId: effectiveAgentId,
  };
}

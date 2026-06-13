import type { GrueneratorAdapterConfig } from './types';
import type { ThreadMode } from '../../stores/chatStore';
import type { parseAllMentions } from '../../lib/mentionParser';

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
  docMentionIds: string[];
  wolkeFiles: ReturnType<typeof parseAllMentions>['wolkeFiles'];
  connectFiles: ReturnType<typeof parseAllMentions>['connectFiles'];
  mergedDocChatIds: string[];
  hasDocumentChat: boolean;
  injectedCurrentDocument: InjectedCurrentDocument | undefined;
  injectedAttachmentContext: string | undefined;
  seededInitialAssistantMessage: string | undefined;
  /** Variant marked "active for chat editing" on a sharepic card, if any. */
  currentSharepic: {
    variantId: string;
    canvasId: string | null;
    canvasType: string;
  } | null;
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
    docMentionIds,
    wolkeFiles,
    connectFiles,
    mergedDocChatIds,
    hasDocumentChat,
    injectedCurrentDocument,
    injectedAttachmentContext,
    seededInitialAssistantMessage,
    currentSharepic,
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
    // Notebook mode: query + collection scoping from selectedNotebookId
    return {
      query: lastUserText(formattedMessages),
      notebookId: config.selectedNotebookId || 'gruenerator-notebook',
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
    docMentionIds: docMentionIds.length > 0 ? docMentionIds : undefined,
    wolkeFiles: wolkeFiles.length > 0 ? wolkeFiles : undefined,
    connectFiles: connectFiles.length > 0 ? connectFiles : undefined,
    documentChatIds: mergedDocChatIds.length > 0 ? mergedDocChatIds : undefined,
    documentChatMode: hasDocumentChat || mergedDocChatIds.length > 0 || undefined,
    currentDocument: injectedCurrentDocument,
    currentSharepic: currentSharepic ?? undefined,
    currentReel: currentReel ?? undefined,
    reelUpload: reelUpload ?? undefined,
    attachmentContext: injectedAttachmentContext,
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

// React Native entry point for @gruenerator/chat
// Only exports platform-agnostic symbols (stores, types, adapters, utilities).
// Web-only components (Radix UI, @gruenerator/ui, @gruenerator/voice, @gruenerator/collab)
// are excluded to prevent Metro from resolving browser-only dependencies.

// Unified Message Metadata
export { type ChatMessageMetadata } from './types/messageMetadata';

// Context & API Client
export {
  chatFetch,
  chatApiClient,
  createChatApiClient,
  type ChatApiClient,
} from './context/ChatContext';

// Config Store
export {
  useChatConfigStore,
  useChatFetch,
  useChatEndpoints,
  type ChatConfig,
  type ResolvedEndpoints,
} from './stores/chatConfigStore';

// Runtime Adapters (platform-agnostic — no web deps)
export { GrueneratorAttachmentAdapter } from './runtime/GrueneratorAttachmentAdapter';
export {
  createGrueneratorModelAdapter,
  type GrueneratorMessageMetadata,
  type GrueneratorAdapterConfig,
  type GrueneratorAdapterCallbacks,
} from './runtime/GrueneratorModelAdapter';
export {
  createGrueneratorThreadListAdapter,
  getThreadType,
  getNotebookCollectionId,
  type ExternalThreadEntry,
} from './runtime/GrueneratorThreadListAdapter';

// External Thread Context
export { ExternalThreadProvider, useExternalThread } from './context/ExternalThreadContext';

// Notebook Runtime Adapter (platform-agnostic parts only)
export {
  createNotebookModelAdapter,
  type NotebookAdapterConfig,
  type NotebookMessageMetadata,
  type NotebookAdapterCallbacks,
} from './runtime/NotebookModelAdapter';

// Types (from useChatGraphStream)
export {
  type ProgressStage,
  type ProgressStep,
  type SearchIntent,
  type GeneratedImage,
  type ChatProgress,
  type Citation,
  type SearchResult,
  type StreamMetadata,
  type ChatMessage,
  type UseChatGraphStreamOptions,
  type UseChatGraphStreamReturn,
} from './hooks/useChatGraphStream';

// Stores
export {
  useAgentStore,
  MODEL_OPTIONS,
  PROVIDER_OPTIONS,
  type CompactionState,
  type Provider,
  type ModelId,
  type ToolKey,
  type ModelOption,
  type ProviderOption,
  type ThreadMode,
  type SearchMode,
} from './stores/chatStore';

export { useDocumentChatStore } from './stores/documentChatStore';
export { useSkillFavoritesStore } from './stores/skillFavoritesStore';

// Mention detection & insertion (shared logic for web + mobile)
export {
  detectMention,
  getFilteredFunctions,
  getFilteredSkills,
  getFilteredForMode,
  type MentionDetectionResult,
} from './lib/mentionDetection';
export { computeMentionInsertion, type MentionInsertionResult } from './lib/mentionInsertion';

// File mention data hook
export { useFileMentionData } from './hooks/useFileMentionData';

// useMessageTTS excluded — imports @gruenerator/voice (web-only)

// Citation Utils
export { mapRawCitationsToChat, resolveCitations } from './lib/citationUtils';

// SSE Parsing
export { parseSSELine, type SSECurrentEvent, type SSEParseResult } from './lib/sseParser';

// URL Utilities
export { extractDomain, getFaviconUrl, getHostname, faviconFromHostname } from './lib/urlUtils';

// Lib
export { chatSuggestions } from './lib/suggestions';
export {
  agentsList,
  getDefaultAgent,
  resolveAgentMention,
  SKILL_CATEGORY_LABELS,
  type AgentConfig,
  type AgentListItem,
  type SkillCategory,
} from './lib/agents';
export {
  parseMention,
  extractAgentFromMessage,
  parseAllMentions,
  type MentionResult,
  type ParsedMentions,
} from './lib/mentionParser';
export {
  resolveMentionable,
  filterMentionables,
  agentMentionables,
  notebookMentionables,
  documentMentionables,
  getAllMentionables,
  setCustomAgents,
  getCustomAgentMentionables,
  customAgentToMentionable,
  setBoardMentionables,
  getBoardMentionables,
  boardToolMentionables,
  setDocMentionables,
  getDocMentionables,
  toolMentionables,
  filterMentionablesByCategory,
  type Mentionable,
  type MentionableType,
  type MentionableCategory,
  type CustomAgentMentionable,
  type BoardMentionable,
  type DocMentionable,
} from './lib/mentionables';
export { INTENT_TO_TOOL, DEEP_TOOL_MAP } from './lib/toolMappings';

// Thread History Adapter (shared between drawer + provider on mobile)
export {
  createThreadHistoryAdapter,
  type LoadedMessage,
  type ThreadHistoryAdapter,
} from './adapters/createThreadHistoryAdapter';
export {
  convertToThreadMessageLike,
  transformMessageLike,
} from './adapters/messageTransform.native';
export {
  registerDocumentSlug,
  resolveDocumentSlug,
  clearDocumentSlugs,
  documentToSlug,
  type DocumentMention,
  type DocumentSourceType,
  type NotebookCollectionItem,
  type NotebookDocumentItem,
  type DocumentSearchResult,
  type UserDocumentItem,
  type UserTextItem,
} from './lib/documentMentionables';
export {
  validateFile,
  validateFiles,
  fileToBase64,
  formatFileSize,
  getFileTypeDisplayName,
  isImageMimeType,
  isSupportedFileType,
  prepareFilesForSubmission,
  createFilesSummary,
  getAcceptedFileTypes,
  FILE_LIMITS,
  type AllowedMimeType,
  type ProcessedFile,
  type FileSummary,
} from './lib/fileUtils';

// Unified Message Metadata
export { type ChatMessageMetadata } from './types/messageMetadata';

// Extra Actions Context
export {
  ExtraActionsProvider,
  useExtraActions,
  type ExtraAction,
  type ExtraActionFactory,
} from './context/ExtraActionsContext';

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

// Runtime
export { GrueneratorChatProvider } from './runtime/GrueneratorChatProvider';
export { GrueneratorAttachmentAdapter } from './runtime/GrueneratorAttachmentAdapter';
export {
  createGrueneratorModelAdapter,
  type GrueneratorMessageMetadata,
  type GrueneratorAdapterConfig,
  type GrueneratorAdapterCallbacks,
} from './runtime/GrueneratorModelAdapter';
export {
  createGrueneratorThreadListAdapter,
  type ExternalThreadEntry,
} from './runtime/GrueneratorThreadListAdapter';

// External Thread Context
export { ExternalThreadProvider, useExternalThread } from './context/ExternalThreadContext';

// Notebook Runtime
export {
  NotebookChatProvider,
  type NotebookChatProviderProps,
} from './runtime/NotebookChatProvider';
export {
  createNotebookModelAdapter,
  type NotebookAdapterConfig,
  type NotebookMessageMetadata,
  type NotebookAdapterCallbacks,
} from './runtime/NotebookModelAdapter';
export { NotebookComposer, type SourceFilterConfig } from './components/notebook/NotebookComposer';

// Thread Components
export { GrueneratorThread } from './components/thread/GrueneratorThread';
export { GrueneratorComposer } from './components/thread/GrueneratorComposer';
export { FileMentionPopover } from './components/thread/FileMentionPopover';
export { DocumentChatPicker } from './components/thread/DocumentChatPicker';
export { SkillPopover } from './components/thread/SkillPopover';
export { PlusMenu } from './components/thread/PlusMenu';
export { UserMessage } from './components/thread/UserMessage';
export { AssistantMessage } from './components/thread/AssistantMessage';
export { WelcomeScreen } from './components/thread/WelcomeScreen';
export {
  GrueneratorThreadListItem,
  GrueneratorArchivedThreadListItem,
} from './components/thread/ThreadListItem';

// Message Part Components
export { ProgressIndicator } from './components/message-parts/ProgressIndicator';
export { ProgressTracker } from './components/tool-ui/progress-tracker/ProgressTracker';
export { TypingIndicator } from './components/message-parts/TypingIndicator';
export {
  SearchResultsSection,
  type AdditionalSource,
} from './components/message-parts/SearchResultsSection';
export { SourceCard } from './components/message-parts/SourceCard';
export { CitationBadge } from './components/message-parts/CitationPopover';
export { Citation as CitationCard } from './components/tool-ui/citation/ProjectCitation';
export { GeneratedImageDisplay } from './components/message-parts/GeneratedImageDisplay';
export { MessageActions } from './components/message-parts/MessageActions';

// Citation Context
export {
  CitationProvider,
  useCitations,
  useCitationContext,
  useFetchFullText,
  type CitationContextValue,
  type FetchFullTextFn,
} from './context/CitationContext';

// Layout & UI Components
export { ChatLayout } from './components/ChatLayout';
export { ChatOverview, type NotebookLink } from './components/ChatOverview';
export { ChatSidebar } from './components/ChatSidebar';
export { ChatThreadList } from './components/ChatThreadList';
export { ModelSelector } from './components/ModelSelector';
export { ToolToggles } from './components/ToolToggles';
export { MarkdownContent } from './components/MarkdownContent';
export { ToolCallUI } from './components/ToolCallUI';
export { grueneratorToolkit } from './components/tool-ui/GrueneratorToolUIs';
export { ThemeProvider, useTheme } from './components/ThemeProvider';
export { Dropdown, DropdownItem, ToggleSwitch } from './components/ui/Dropdown';
export { TooltipProvider } from './components/ui/tooltip';

// Tool UI Schemas
export { safeParseSerializableCitation } from './components/tool-ui/citation/schema';
export { safeParseProgressTracker } from './components/tool-ui/progress-tracker/schema';

// Tool UI Citation (official @tool-ui/citation registry)
export {
  Citation as ToolUICitation,
  type CitationProps as ToolUICitationProps,
  CitationList,
  type CitationListProps,
  type SerializableCitation,
  type CitationType,
  type CitationVariant,
} from './components/tool-ui/citation';

// Tool UI Link Preview (official @tool-ui/link-preview registry)
export {
  LinkPreview,
  type LinkPreviewProps,
  type SerializableLinkPreview,
} from './components/tool-ui/link-preview';

// Types (from useChatGraphStream — kept for backward compatibility)
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
} from './stores/chatStore';

export { useDocumentChatStore } from './stores/documentChatStore';

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

// Citation Utils
export { mapRawCitationsToChat, resolveCitations } from './lib/citationUtils';

// Lib
export { cn } from './lib/utils';
export { chatSuggestions } from './lib/suggestions';
export {
  agentsList,
  getDefaultAgent,
  resolveAgentMention,
  type AgentConfig,
  type AgentListItem,
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
  allMentionables,
  getAllMentionables,
  setCustomAgents,
  getCustomAgentMentionables,
  customAgentToMentionable,
  toolMentionables,
  filterMentionablesByCategory,
  type Mentionable,
  type MentionableType,
  type MentionableCategory,
  type CustomAgentMentionable,
} from './lib/mentionables';
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

// Grün-O-Mat embeddable components
export { GruenOMatModal, type GruenOMatModalProps } from './components/gruen-o-mat/GruenOMatModal';
export {
  GruenOMatDialog,
  type GruenOMatDialogProps,
} from './components/gruen-o-mat/GruenOMatDialog';
export { ModalThread, type ModalThreadProps } from './components/gruen-o-mat/ModalThread';

// Icons
export { ChatIcon } from './components/icons/ChatIcon';

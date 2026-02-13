// Context & API Client
export { chatFetch, chatApiClient, type ChatApiClient } from './context/ChatContext';

// Runtime
export { GrueneratorChatProvider } from './runtime/GrueneratorChatProvider';
export { GrueneratorAttachmentAdapter } from './runtime/GrueneratorAttachmentAdapter';
export {
  createGrueneratorModelAdapter,
  type GrueneratorMessageMetadata,
  type GrueneratorAdapterConfig,
  type GrueneratorAdapterCallbacks,
} from './runtime/GrueneratorModelAdapter';
export { createGrueneratorThreadListAdapter } from './runtime/GrueneratorThreadListAdapter';

// Thread Components
export { GrueneratorThread } from './components/thread/GrueneratorThread';
export { GrueneratorComposer } from './components/thread/GrueneratorComposer';
export { UserMessage } from './components/thread/UserMessage';
export { AssistantMessage } from './components/thread/AssistantMessage';
export { WelcomeScreen } from './components/thread/WelcomeScreen';
export {
  GrueneratorThreadListItem,
  GrueneratorArchivedThreadListItem,
} from './components/thread/ThreadListItem';

// Message Part Components
export { ProgressIndicator } from './components/message-parts/ProgressIndicator';
export { SearchResultsSection } from './components/message-parts/SearchResultsSection';
export { SourceCard } from './components/message-parts/SourceCard';
export { CitationBadge } from './components/message-parts/CitationPopover';
export { GeneratedImageDisplay } from './components/message-parts/GeneratedImageDisplay';
export { MessageActions } from './components/message-parts/MessageActions';

// Citation Context
export { CitationProvider, useCitations } from './context/CitationContext';

// Layout & UI Components
export { ChatLayout } from './components/ChatLayout';
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

// Types (from useChatGraphStream — kept for backward compatibility)
export {
  type ProgressStage,
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

// Lib
export { cn } from './lib/utils';
export {
  agentsList,
  getDefaultAgent,
  resolveAgentMention,
  type AgentConfig,
  type AgentListItem,
} from './lib/agents';
export { parseMention, extractAgentFromMessage, type MentionResult } from './lib/mentionParser';
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

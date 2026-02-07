// Context & Adapter
export {
  ChatProvider,
  useChatAdapter,
  createApiClient,
  type ChatAdapter,
  type ChatApiClient,
} from './context/ChatContext';

// Components
export { ChatLayout } from './components/ChatLayout';
export { ChatMain } from './components/ChatMain';
export { ChatSidebar } from './components/ChatSidebar';
export { AgentSelector } from './components/AgentSelector';
export { ModelSelector } from './components/ModelSelector';
export { ToolToggles } from './components/ToolToggles';
export { MarkdownContent } from './components/MarkdownContent';
export { ToolCallUI } from './components/ToolCallUI';
export { FileUploadButton } from './components/FileUploadButton';
export { AttachedFilesList, AttachedFilesPreview } from './components/AttachedFilesList';
export { ThemeProvider, useTheme } from './components/ThemeProvider';
export { Dropdown, DropdownItem, ToggleSwitch } from './components/ui/Dropdown';

// Hooks
export {
  useChatGraphStream,
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
export { agentsList, getDefaultAgent, type AgentConfig } from './lib/agents';
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

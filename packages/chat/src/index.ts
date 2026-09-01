// Unified Message Metadata
export {
  type ChatMessageMetadata,
  type ConfirmActionData,
  type ConfirmActionType,
  type DocumentCreatedData,
} from './types/messageMetadata';

// Confirm/reject flow for chat-proposed actions (shared POST; platform cards render around it)
export { confirmChatAction, type ConfirmActionOutcome } from './lib/confirmAction';

// Extra Actions Context
export {
  ExtraActionsProvider,
  useExtraActions,
  type ExtraAction,
  type ExtraActionFactory,
} from './context/ExtraActionsContext';

// Chat Surface Context (per-surface agent/mode/model state)
export {
  ChatSurfaceProvider,
  createChatSurfaceStore,
  useChatSurfaceContext,
  type ChatSurfaceDefaults,
  type ChatSurfaceState,
  type ChatSurfaceStore,
} from './context/ChatSurfaceContext';
export {
  useScopedAgentId,
  useScopedThreadMode,
  useScopedSearchMode,
  useScopedSelectedModel,
  useScopedSelectedNotebookId,
  useScopedCustomSystemPrompt,
  useScopedCustomRoleName,
  useScopedSetSelectedAgent,
  useScopedSetThreadMode,
  useScopedSetSearchMode,
  useScopedSetSelectedModel,
  useScopedSetSelectedNotebook,
  useScopedSetCustomSystemPrompt,
  useScopedSetCustomRoleName,
  getScopedSnapshot,
} from './lib/useScopedAgentState';
export {
  AUTO_MODEL_ID,
  AUTO_MODEL_OPTION,
  resolveAutoModel,
  type AutoModelId,
  type AutoResolverContext,
  type SelectedModel,
} from './lib/resolveAutoModel';

// Composer controls — shared source of truth for the chat composer's modes/tools/labels/icons
export {
  COMPOSER_MODES,
  COMPOSER_TOOLS,
  SEARCH_DEPTHS,
  showsSearchDepth,
  type ComposerModeDef,
  type ComposerIconKey,
  type ComposerToolDef,
  type ComposerToolIconKey,
  type SearchDepthDef,
  type SearchDepthIconKey,
} from './lib/composerControls';

// Notebook retrieval depth — shared registry for the notebook page's tier control
export {
  NOTEBOOK_DEPTHS,
  DEFAULT_NOTEBOOK_DEPTH,
  notebookDepthDef,
  type NotebookDepthDef,
  type NotebookDepthIconKey,
} from './lib/notebookDepth';

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
  type ChatRequestContext,
  type ChatRequestContextProvider,
  type DocumentEditTriggerPayload,
  type DocumentEditTriggerHandler,
} from './stores/chatConfigStore';

// Runtime
export { GrueneratorChatProvider, preloadChatRuntime } from './runtime/GrueneratorChatProvider';
export { useChatRuntimeReady } from './context/ChatRuntimeReadyContext';
export { convertToThreadMessageLike } from './runtime/threadMessageConversion';
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
  getThreadSlugSuffix,
  getThreadAgentId,
  resolveThreadBySlugSuffix,
  type ExternalThreadEntry,
} from './runtime/GrueneratorThreadListAdapter';
export { buildThreadPath } from './lib/threadPath';

// External Thread Context
export { ExternalThreadProvider, useExternalThread } from './context/ExternalThreadContext';

// Chat Collaboration (presence, typing) — surface-scoped, e.g. for docs editor
export {
  ChatCollaborationProvider,
  useChatCollaborationContext,
} from './context/ChatCollaborationContext';
export { useChatCollaboration } from './hooks/useChatCollaboration';

// Editor Assistant — shared host for embedded editor chat sidebars
// (docs / sheets / presentations / boards / canvas).
export {
  EditorAssistantProvider,
  useEditorAssistant,
  usePeerMessageSync,
  deriveGateState,
  shouldImportHistory,
  isReady as isEditorAssistantReady,
  type EditorAssistantProviderProps,
  type EditorAssistantState,
  type EditorSurfaceAdapter,
  type EditorSurfaceKind,
  type EditorToolConfig,
  type EditorRegistrationCtx,
} from './editor-surface';

// Notebook Runtime
export {
  NotebookChatProvider,
  type NotebookChatProviderProps,
  type SharepicContext,
} from './runtime/NotebookChatProvider';
export {
  createNotebookModelAdapter,
  type NotebookAdapterConfig,
  type NotebookMessageMetadata,
  type NotebookAdapterCallbacks,
  type SharepicContextConfig,
} from './runtime/NotebookModelAdapter';
export {
  NotebookComposer,
  type SourceFilterConfig,
  type CategoryFilterConfig,
} from './components/notebook/NotebookComposer';
export { type CategoryFilterField } from './components/notebook/CategoryFilterDropdown';

// Thread Components
export { GrueneratorThread } from './components/thread/GrueneratorThread';
export { SharepicArtifactPanel } from './components/SharepicArtifactPanel';
export { ReelArtifactPanel } from './components/ReelArtifactPanel';
export { ArtifactPanel } from './components/ArtifactPanel';
export { useDockedPanelActive } from './hooks/useDockedPanelActive';
export { useReportPanelDockable } from './hooks/useReportPanelDockable';
export {
  composerActiveChipClass,
  composerActiveChipIconClass,
  composerToolbarButtonClass,
} from './lib/utils';
export { useChatDensity, type ChatDensity } from './components/thread/chatDensityContext';
export { GrueneratorComposer } from './components/thread/GrueneratorComposer';
export { type ComposerPreset } from './components/thread/PlusMenu';
export { FileMentionPopover } from './components/thread/FileMentionPopover';
export { DocumentChatPicker } from './components/thread/DocumentChatPicker';
export { SkillLibraryModal } from './components/skills/SkillLibraryModal';
export { useSkillFavoritesStore } from './stores/skillFavoritesStore';
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
export { MessageSourcesButton } from './components/message-parts/MessageSourcesButton';
export { MessageTTSButton } from './components/message-parts/MessageTTSButton';
export { useMessageTTS, type TTSState } from './hooks/useMessageTTS';

// Citation Context
export {
  CitationProvider,
  useCitations,
  useCitationContext,
  useFetchFullText,
  type CitationContextValue,
  type FetchFullTextFn,
} from './context/CitationContext';

// Markdown streaming animation toggle (per-thread)
export { MarkdownStreamingProvider, useMarkdownSmooth } from './context/MarkdownStreamingContext';

// Citation Panel (chunk-level navigation)
export {
  CitationPanelProvider,
  useCitationPanel,
  type CitationPanelTarget,
} from './context/CitationPanelContext';
export { CitationSidePanel } from './components/message-parts/CitationSidePanel';

// Layout & UI Components
export { ChatLayout } from './components/ChatLayout';
export { ChatSidebar } from './components/ChatSidebar';
export { ChatThreadList } from './components/ChatThreadList';
export { ChatThreadRouting, type ChatThreadRoutingProps } from './components/ChatThreadRouting';
export { MarkdownContent } from './components/MarkdownContent';
export { CitationMarkdownText } from './components/message-parts/CitationMarkdownText';
export { ToolCallUI } from './components/ToolCallUI';
export { grueneratorToolkit } from './components/tool-ui/GrueneratorToolUIs';
export { ThemeProvider, useTheme } from './components/ThemeProvider';
export { TooltipProvider } from '@gruenerator/ui';

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
  type SharepicData,
  type SharepicVariant,
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
export { useUserProfileStore, type UserRole } from './stores/userProfileStore';
export { useUserAgentsRegistry } from './stores/userAgentsRegistry';
export { setThreadListSlot, useThreadListSlot } from './stores/threadListSlotStore';

// Mention detection & insertion (shared logic for web + mobile)
export {
  detectMention,
  getFilteredMentionables,
  type MentionDetectionResult,
} from './lib/mentionDetection';
export { computeMentionInsertion, type MentionInsertionResult } from './lib/mentionInsertion';

// File mention data hook
export { useFileMentionData } from './hooks/useFileMentionData';

// Admin-curated Rezepte visibility. Also mirrors into module state consumed
// by getAgentMentionables (mentionParser picker) as a side effect — call it
// once high in the tree (e.g. alongside useMentionablesQuery) and read the
// returned array directly wherever a live Rezepte catalog is rendered
// (Agentura, SkillLibraryModal, PlusMenu).
export { useHiddenAgentIdentifiers, useHiddenSkillMentions } from './hooks/useMentionablesQuery';

// Landesverbands-Zuteilung aus den Profilrollen. Steuert, welche LV-Agenten,
// -Rezepte und -Notebooks eine Person überhaupt angeboten bekommt.
export { useUserLandesverbaende, type UserLandesverbaende } from './hooks/useUserLandesverbaende';

// Typed-mention attachments (Wolke / Connect / web page) and the Canva draft
// insertion. Shared so the recognition triple the backend keys on cannot drift
// between platforms — see lib/mentionAttachments.ts.
export {
  buildWolkeAttachment,
  buildConnectAttachment,
  buildWebpageAttachment,
  normalizeWebpageUrl,
  canvaDesignsMarkdown,
  appendToDraft,
  type MentionAttachment,
} from './lib/mentionAttachments';
export { joinWolkePath, wolkeParentPath, isWolkeRoot } from './lib/wolkePath';

// Citation Utils
export { mapRawCitationsToChat, resolveCitations } from './lib/citationUtils';

// SSE Parsing
export { parseSSELine, type SSECurrentEvent, type SSEParseResult } from './lib/sseParser';

// URL Utilities
export { domainHue, domainInitial, extractDomain, getHostname } from './lib/urlUtils';

// Lib
export { cn } from './lib/utils';
export { chatSuggestions } from './lib/suggestions';
export {
  agentsList,
  getDefaultAgent,
  getPinnedAgents,
  resolveAgentMention,
  SKILL_CATEGORY_LABELS,
  type AgentConfig,
  type AgentListItem,
  type PinnedAgent,
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
  mentionableKey,
  notebookMentionables,
  documentMentionables,
  getAllMentionables,
  getAgentMentionables,
  setMentionInstance,
  setMentionLocale,
  getMentionLocale,
  setMentionLandesverbaende,
  setHiddenSkillMentions,
  setCustomAgents,
  getCustomAgentMentionables,
  customAgentToMentionable,
  setUserAgentMentionables,
  getUserAgentMentionables,
  userAgentToMentionable,
  setBoardMentionables,
  getBoardMentionables,
  boardToolMentionables,
  setDocMentionables,
  getDocMentionables,
  toolMentionables,
  visibleToolMentionables,
  visibleNotebookMentionables,
  filterMentionablesByCategory,
  type Mentionable,
  type MentionableType,
  type MentionableCategory,
  type CustomAgentMentionable,
  type UserAgentMentionable,
  type BoardMentionable,
  type DocMentionable,
} from './lib/mentionables';
export {
  slugifyMention,
  syncBoards,
  syncCustomAgents,
  syncDocs,
  syncMcpServers,
  syncSheets,
  syncTextforms,
  syncUserAgents,
  syncUserNotebooks,
  type MentionableFetch,
} from './lib/mentionableSync';
export {
  splitRecipesByOrigin,
  RECIPE_ORIGIN_SUBLABELS,
  RECIPE_ORIGIN_SECTION_TITLES,
  type RecipeOrigin,
} from './lib/mentionSections';
export {
  INTENT_TO_TOOL,
  DEEP_TOOL_MAP,
  // Benennt Konnektor-Werkzeuge (`m<key>__<tool>`) lesbar; die
  // Freigabe-Karten beider Plattformen brauchen denselben Namen.
  formatNamespacedToolLabel,
} from './lib/toolMappings';

// Which tool calls live in the shimmering status line instead of drawing a card.
export {
  isSearchProgressTool,
  selectHasVisibleToolCard,
  selectReasoningText,
  selectSearchSources,
  selectSearchStatusLabel,
  selectStepAfterText,
  type StatusPartLike,
} from './lib/toolStatusLine';

// Tool-result parsing & metadata (platform-agnostic; kept in sync with index.native.ts)
export {
  getString,
  getArray,
  getObject,
  getNumber,
  getBoolean,
  getToolMeta,
  getToolQuery,
  toSerializableCitation,
  parseSearchCitations,
  parseExampleCitations,
  parseWebCitations,
  parseResearchResult,
  researchCitationToSerializable,
  extractHeadings,
  extractFirstParagraph,
  buildExportMarkdown,
  CONFIDENCE_LABELS,
  parsePersonResult,
  parseExamples,
  parseScrapeResult,
  parsePressemitteilungExamples,
  pressemitteilungLvLabel,
  formatGermanDate,
  getToolResultCount,
  toolResultSummary,
  toolOutcome,
  toolErrorMessage,
  type ToolIconKey,
  type ToolAccent,
  type ToolOutcome,
  type ToolMeta,
  type ResearchCitation,
  type ResearchConfidence,
  type ResearchSearchStep,
  type ParsedResearchResult,
  type ParsedPersonResult,
  type ExampleSnippet,
  type ScrapedPage,
  type PressemitteilungExample,
  type ParsedPressemitteilungExamples,
} from './lib/toolResults';

// Werkzeug-Freigabe: die plattformneutrale Hälfte. Web rendert sie als Karte,
// Native als Karte im eigenen Idiom — beide lesen dieselben Optionen und
// dieselben Beschriftungen, damit die Entscheidung überall gleich heisst.
export {
  TOOL_APPROVAL_OPTIONS,
  approvalDecidedLabel,
  isApprovalDecided,
  type ToolApprovalOptionId,
  type ToolApprovalState,
} from './lib/toolApproval';

// Tool view-models & registry (platform-neutral; each platform maps kind → component)
export {
  ToolViewKindSchema,
  ToolResultVMSchema,
  type ToolViewKind,
  type ToolResultVM,
  type CitationListVM,
  type LinkPreviewVM,
  type MarkdownReportVM,
  type SnippetListVM,
  type PressExamplesVM,
  type PersonVM,
  type ImageResultVM,
  type TextNoteVM,
  type KeyValueVM,
  type KeyValueEntry,
} from './lib/toolViewModels';
export {
  TOOL_REGISTRY,
  UI_TOOL_NAMES,
  resolveToolEntry,
  parseGenericFallback,
  type UiToolName,
  type ToolRegistryEntry,
} from './lib/toolRegistry';
export {
  registerDocumentSlug,
  buildDocumentMentionAttachment,
  buildCollabDocAttachment,
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

// Generic modal-style chat primitives (reusable across contexts)
export { ChatModalDialog, type ChatModalDialogProps } from './components/modal/ChatModalDialog';
export { CompactThread, type CompactThreadProps } from './components/modal/CompactThread';
export { CompactWelcome, type CompactWelcomeProps } from './components/modal/CompactWelcome';

// Grün-O-Mat embeddable components (presets layered on the generic primitives)
export { GruenOMatModal, type GruenOMatModalProps } from './components/gruen-o-mat/GruenOMatModal';
export {
  GruenOMatDialog,
  type GruenOMatDialogProps,
} from './components/gruen-o-mat/GruenOMatDialog';
export { ModalThread, type ModalThreadProps } from './components/gruen-o-mat/ModalThread';

// Icons
export { ChatIcon } from './components/icons/ChatIcon';
export { default as GrueneratorHomeIconLoading } from './components/icons/GrueneratorHomeIconLoading';

// Composer plus-menu assembly — shared by web's PlusMenu and mobile's ComposerActionSheet
export {
  quickSkillMentionables,
  functionMentionables,
  connectorMentionables,
  connectorId,
} from './lib/plusMenu';

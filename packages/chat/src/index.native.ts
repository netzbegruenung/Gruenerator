// React Native entry point for @gruenerator/chat
// Only exports platform-agnostic symbols (stores, types, adapters, utilities).
// Web-only components (Radix UI, @gruenerator/ui, @gruenerator/voice, @gruenerator/collab)
// are excluded to prevent Metro from resolving browser-only dependencies.

// Unified Message Metadata
export {
  type ChatMessageMetadata,
  type ConfirmActionData,
  type ConfirmActionType,
  type DocumentCreatedData,
} from './types/messageMetadata';

// Confirm/reject flow for chat-proposed actions (shared POST; platform cards render around it)
export { confirmChatAction, type ConfirmActionOutcome } from './lib/confirmAction';

// Sharepic variants. The app cannot draw one — it borrows the web renderer
// through a hidden WebView (`services/sharepicRender.ts`) — but the data and
// the live edit state are plain stores, so both platforms read the same ones.
export { type SharepicData, type SharepicVariant } from './hooks/useChatGraphStream';
export {
  useSharepicLiveStore,
  type SharepicLiveEntry,
  type ActiveSharepic,
} from './stores/sharepicLiveStore';

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
  type MemoryContextInfo,
  type Citation,
  type SearchResult,
  type StreamMetadata,
  type ChatMessage,
  type ChartData,
  type ComputeData,
  type UseChatGraphStreamOptions,
  type UseChatGraphStreamReturn,
} from './hooks/useChatGraphStream';

// Math rendering (platform-neutral text processing; native renders segments
// via a KaTeX WebView, web goes through remark-math/rehype-katex instead)
export { normalizeMathDelimiters, normalizeUnicodeMath } from './lib/normalizeMathDelimiters';
export { splitMathSegments, type MathSegment } from './lib/mathSegments';

// Compute results (run_python stdout → ComputeData entries; shared with web)
export { parseComputeResult } from './lib/computeResult';

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

// Model auto-selection (shared with web index.ts — keep both in sync)
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

export { useDocumentChatStore } from './stores/documentChatStore';
export { useSkillFavoritesStore } from './stores/skillFavoritesStore';

// Live head of the combined social post's text half. The shared SSE parser
// already writes here on `social_post_complete` / `social_post_updated`, so a
// card rendering only its own message payload would go stale the moment the
// user asks the chat to shorten the post.
export { useSocialPostLiveStore, type ActiveSocialPost } from './stores/socialPostLiveStore';

// Mention detection & insertion (shared logic for web + mobile)
export {
  detectMention,
  getFilteredMentionables,
  type MentionDetectionResult,
} from './lib/mentionDetection';
export { computeMentionInsertion, type MentionInsertionResult } from './lib/mentionInsertion';

// File mention data hook
export { useFileMentionData } from './hooks/useFileMentionData';

// Admin-curated Rezepte visibility — see index.ts for the full comment.
export { useHiddenSkillMentions } from './hooks/useMentionablesQuery';

// Die Landesverbands-Zuteilung aus den Profilrollen. RN-sicher: liest nur den
// zustand-Store, kein Netz, kein DOM. Mobil erst nutzbar, seit die App den
// Profil-Store überhaupt hydratisiert (#2931) — vorher lieferte der Hook
// unverändert `null` und alle Filter ließen alles durch.
export { useUserLandesverbaende, type UserLandesverbaende } from './hooks/useUserLandesverbaende';

// Group-level thread sharing. RN-safe: react-query plus `notify`, which imports
// sonner dynamically and falls back to the console line in hosts that do not
// ship it (mobile).
export { useThreadSharing } from './hooks/useThreadSharing';

// Data sources for the typed-mention pickers (Nextcloud share links, connected
// accounts, Canva). RN-safe: react-query over the configured chat fetch.
export {
  useUserShareLinksQuery,
  useWolkeBrowseQuery,
  useConnectProvidersQuery,
  useConnectBrowseQuery,
  useCanvaDesignsQuery,
  type ChatShareLink,
  type ChatWolkeFile,
  type ChatConnectProvider,
  type ChatConnectFile,
  type ChatCanvaDesign,
} from './hooks/useMentionablesQuery';
export {
  type WolkeFileToken,
  type ConnectFileToken,
  type CanvaDesignToken,
} from './lib/mentionables';

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

// useMessageTTS excluded — imports @gruenerator/voice (web-only). The text
// preparation is pure and shared, so both platforms read the same words.
export { stripForSpeech } from './lib/speechText';

// Day-separator labels. Pure calendar logic (no React, no DOM) so mobile draws
// the same rule web does — "Heute"/"Gestern"/date, and only where the calendar
// day actually changes — instead of re-deriving it and drifting.
export {
  buildDaySeparatorLabels,
  dayLabel,
  type DatedEntry,
} from './components/message-parts/messageTimestampLabels';

// Citation Utils
export { mapRawCitationsToChat, resolveCitations } from './lib/citationUtils';

// Full-text loader for citation detail views. RN-safe (only react +
// useChatConfigStore.fetch, which mobile configures via configureMobileChat) —
// the same hook web uses, so the source fetch stays shared, not duplicated.
export { useFetchFullText, type FetchFullTextFn } from './context/CitationContext';

// SSE Parsing
export { parseSSELine, type SSECurrentEvent, type SSEParseResult } from './lib/sseParser';

// Narration view-logic + label pacing (shared web + mobile)
export { selectNarration, selectApprovalLabels, type PartLike } from './lib/narrationView';
export { usePacedLabel } from './hooks/usePacedLabel';

// The streaming status line's two decisions — which element, which sentence.
// Shared verbatim with web's StreamingStatusLine/ProgressTracker; the platforms
// used to hand-sync these rules by comment, and drifted.
export {
  selectStatusLabel,
  selectStatusLineView,
  type StatusLabel,
  type StatusLineView,
} from './lib/statusLineView';

// Contiguous tool-call runs. Web gets the boundaries from assistant-ui's
// ToolGroup slot; @assistant-ui/react-native has none, so mobile derives them
// here and both then feed the same computeToolGroupView.
export { selectToolRun, type ToolRunView } from './lib/toolRunGrouping';
export { type ToolGroupView, type ToolGroupMode } from './lib/narrationView';

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

// URL Utilities
export { domainHue, domainInitial, extractDomain, getHostname } from './lib/urlUtils';

// Tool-result parsing & metadata (platform-agnostic; web + mobile share these)
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

// SerializableCitation type (Zod-derived, JSON-safe — RN-safe as a type)
export { type SerializableCitation } from './components/tool-ui/citation/schema';

// Grünerator loading-icon geometry (shared shapes; each platform animates them)
export * as grueneratorHomeIconGeometry from './components/icons/grueneratorHomeIconGeometry';

// Lib
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
  getMcpServerMentionables,
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

// Thread History Adapter (shared between drawer + provider on mobile)
export {
  createThreadHistoryAdapter,
  type LoadedMessage,
  type ThreadHistoryAdapter,
} from './adapters/createThreadHistoryAdapter';
export {
  convertToThreadMessageLike,
  transformMessageLike,
  type ConvertedMessage,
} from './adapters/messageTransform.native';
export { extractContent } from './adapters/messageConversion';
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

// Composer plus-menu assembly — shared by web's PlusMenu and mobile's ComposerActionSheet
export {
  quickSkillMentionables,
  functionMentionables,
  connectorMentionables,
  connectorId,
} from './lib/plusMenu';

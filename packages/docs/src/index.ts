// Context & Adapter
export {
  DocsProvider,
  useDocsAdapter,
  createDocsApiClient,
  type DocsAdapter,
  type DocsApiClient,
  type DocsRequestOptions,
} from './context/DocsContext';

// Components — Editor
export { BlockNoteEditor, type BlockNoteEditorProps } from './components/editor/BlockNoteEditor';
export { PresenceAvatars } from './components/editor/PresenceAvatars';

// Components — Document
export { AIDocumentCreator } from './components/document/AIDocumentCreator';
export { CreateDocumentFAB } from './components/document/CreateDocumentFAB';
export { DocumentList } from './components/document/DocumentList';
export { TemplateCarousel } from './components/document/TemplateCarousel';
export { TemplatePicker } from './components/document/TemplatePicker';

// Components — Chat
/** @deprecated Replaced by `DocsAssistantChat` in apps/web/src/features/docs/. Kept only to render legacy Yjs chat history on documents created before the AI-chat migration. */
export { ChatSidebar } from './components/chat/ChatSidebar';
/** @deprecated See {@link ChatSidebar}. */
export { ChatMessageComponent } from './components/chat/ChatMessage';
/** @deprecated See {@link ChatSidebar}. */
export { ChatComposer } from './components/chat/ChatComposer';

// Components — Permissions
export { ShareModal } from './components/permissions/ShareModal';

// Components — Version History
export { VersionHistory } from './components/version/VersionHistory';

// Components — Common
export { ErrorBoundary } from './components/common/ErrorBoundary';

// Hooks
export { useCollaborators, type CollaborationUser } from '@gruenerator/collab';
/** @deprecated Yjs peer-to-peer chat replaced by `DocsAssistantChat`. Hook is retained so the legacy tab can still display history on docs that have prior messages. */
export { useDocumentChat, type ChatMessage } from './hooks/useDocumentChat';
export { useBlockNoteComments } from './hooks/useBlockNoteComments';
export {
  docsKeys,
  useDocuments,
  useCreateDocument,
  useDeleteDocument,
  useUpdateDocument,
  useDuplicateDocument,
  useGenerateDocument,
} from './hooks/useDocuments';
export { useResolveUsers } from './hooks/useResolveUsers';
export { usePendingDocAI } from './hooks/usePendingDocAI';
export {
  useDocUndoState,
  getDocUndoFlags,
  type DocUndoState,
  type UndoableEditor,
} from './hooks/useDocUndoState';
export { useDocAIReviewState, type DocAIReviewState } from './hooks/useDocAIReviewState';
export { useIsTouchDevice } from '@gruenerator/shared/hooks';
export { useVersionHistoryShortcut } from './hooks/useVersionHistoryShortcut';

// Stores
export { useDocumentStore, type Document } from './stores/documentStore';
export { useEditorStore } from './stores/editorStore';
export { useEditorPreferencesStore, type ToolbarMode } from './stores/editorPreferencesStore';

// Lib
export {
  templates,
  getTemplateContent,
  type TemplateType,
  type DocumentTemplate,
} from './lib/templates';
export {
  cn,
  isMac,
  blocksToHTML,
  blocksToMarkdown,
  blocksToPlainText,
  htmlToBlocks,
  markdownToBlocks,
  getEditorText,
  isEditorEmpty,
  handleImageUpload,
  MAX_FILE_SIZE,
} from './lib/blockNoteUtils';
export { defaultDocumentContent } from './lib/defaultContent';
export {
  invokeDocumentAI,
  isDocAIInvocationInFlight,
  subscribeDocAIInFlight,
} from './lib/invokeDocumentAI';
export {
  acceptDocumentAI,
  rejectDocumentAI,
  type AcceptDocumentAIResult,
} from './lib/reviewDocumentAI';

// Utils
export { lazyWithRetry } from './utils/lazyWithRetry';
export { isChunkLoadError } from './utils/chunkErrors';

// Icons
export { DocsIcon } from './components/icons/DocsIcon';

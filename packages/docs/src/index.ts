// Context & Adapter
export {
  DocsProvider,
  useDocsAdapter,
  createDocsApiClient,
  type DocsAdapter,
  type DocsApiClient,
} from './context/DocsContext';

// Components — Editor
export { BlockNoteEditor, type BlockNoteEditorProps } from './components/editor/BlockNoteEditor';
export { PresenceAvatars } from './components/editor/PresenceAvatars';

// Components — Document
export { AIDocumentCreator } from './components/document/AIDocumentCreator';
export { DocumentList } from './components/document/DocumentList';
export { TemplateCarousel } from './components/document/TemplateCarousel';
export { TemplatePicker } from './components/document/TemplatePicker';

// Components — Chat
export { ChatSidebar } from './components/chat/ChatSidebar';
export { ChatMessageComponent } from './components/chat/ChatMessage';
export { ChatComposer } from './components/chat/ChatComposer';

// Components — Permissions
export { ShareModal } from './components/permissions/ShareModal';

// Components — Common
export { ErrorBoundary } from './components/common/ErrorBoundary';

// Hooks
export { useCollaborators, type CollaborationUser } from '@gruenerator/collab';
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
export { useIsTouchDevice } from './hooks/useIsTouchDevice';

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

// Utils
export { lazyWithRetry } from './utils/lazyWithRetry';
export { isChunkLoadError } from './utils/chunkErrors';

// Icons
export { DocsIcon } from './components/icons/DocsIcon';

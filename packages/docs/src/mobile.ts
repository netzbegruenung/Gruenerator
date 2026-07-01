/**
 * Lean entry point for the mobile DOM editor (apps/mobile DocEditorDOM).
 *
 * Metro bundles everything reachable from an entry file without tree shaking,
 * so importing the full index barrel pulls DocumentList, VersionHistory,
 * ShareModal & co. (incl. entire react-icons packs) into the embedded
 * web bundle shipped inside the APK. Keep this file limited to what the
 * mobile editor actually renders.
 */

export { DocsProvider, useDocsAdapter, type DocsAdapter } from './context/DocsContext';
export { BlockNoteEditor, type BlockNoteEditorProps } from './components/editor/BlockNoteEditor';
export { useDocumentChat, type ChatMessage } from './hooks/useDocumentChat';
export { invokeDocumentAI } from './lib/invokeDocumentAI';
export { acceptDocumentAI, rejectDocumentAI } from './lib/reviewDocumentAI';
// Pure undo/redo flag reader (no react-icons) — used by the DOM bridge to push
// undo/redo availability to the native toolbar.
export { getDocUndoFlags, type UndoableEditor } from './hooks/useDocUndoState';

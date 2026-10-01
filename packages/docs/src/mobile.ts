/**
 * Lean entry point: just the editor and its provider, without the index
 * barrel (DocumentList, VersionHistory, ShareModal & co., incl. entire
 * react-icons packs). Used by the web e2e editor harness
 * (`apps/web/tests/e2e/harness/docs-editor.tsx`).
 */

export { DocsProvider, useDocsAdapter, type DocsAdapter } from './context/DocsContext';
export { BlockNoteEditor, type BlockNoteEditorProps } from './components/editor/BlockNoteEditor';

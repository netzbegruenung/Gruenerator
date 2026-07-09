import { hasPendingSuggestions } from '@gruenerator/docs';
import { uploadToWolke } from '@gruenerator/wolke';
import { useEffect, useRef } from 'react';

import type { BlockNoteEditor } from '@blocknote/core';
import type { Document } from '@gruenerator/docs';

interface UseDocsLiveWolkeSyncArgs {
  editor: BlockNoteEditor | null;
  docData: Document | null | undefined;
  canEdit: boolean;
}

function splitFolderAndFilename(filePath: string): { folderPath?: string; filename: string } {
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash === -1) return { filename: filePath };
  return {
    folderPath: filePath.slice(0, lastSlash),
    filename: filePath.slice(lastSlash + 1),
  };
}

export function useDocsLiveWolkeSync({ editor, docData, canEdit }: UseDocsLiveWolkeSyncArgs): void {
  const dirtyRef = useRef(false);
  const inFlightRef = useRef(false);

  const liveSync = !!docData?.wolke_live_sync;
  const shareLinkId = docData?.wolke_share_link_id ?? null;
  const wolkeFilePath = docData?.wolke_file_path ?? null;
  const docId = docData?.id ?? null;

  const enabled = canEdit && liveSync && !!shareLinkId && !!wolkeFilePath && !!editor && !!docId;

  useEffect(() => {
    if (!editor) return;
    const onChange = () => {
      dirtyRef.current = true;
    };
    const unsubscribe = editor.onChange(onChange);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [editor]);

  useEffect(() => {
    if (!enabled || !editor || !shareLinkId || !wolkeFilePath || !docId) return;

    const flush = async (reason: 'blur' | 'shortcut') => {
      if (!dirtyRef.current || inFlightRef.current) return;
      // Don't push a DOCX with pending suggestion marks to Wolke — deletions
      // would leak as normal text. Wait until they're resolved (stays dirty).
      const view = editor.prosemirrorView;
      if (view && hasPendingSuggestions(view.state.doc)) {
        console.debug('[DocsLiveWolkeSync] skipped — pending suggestions', { reason });
        return;
      }
      inFlightRef.current = true;
      try {
        const { DOCXExporter, docxDefaultSchemaMappings } =
          await import('@blocknote/xl-docx-exporter');
        const exporter = new DOCXExporter(editor.schema, docxDefaultSchemaMappings);
        const blob = await exporter.toBlob(editor.document);
        const arrayBuffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const base64Content = btoa(binary);

        const { folderPath, filename } = splitFolderAndFilename(wolkeFilePath);
        await uploadToWolke(shareLinkId, base64Content, filename, {
          ...(folderPath ? { folderPath } : {}),
          documentId: docId,
        });
        dirtyRef.current = false;
        console.debug('[DocsLiveWolkeSync] re-upload complete', { reason });
      } catch (err) {
        console.warn('[DocsLiveWolkeSync] re-upload failed', err);
      } finally {
        inFlightRef.current = false;
      }
    };

    const editorDom = editor.prosemirrorView?.dom;
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && editorDom && editorDom.contains(next)) return;
      void flush('blur');
    };
    editorDom?.addEventListener('focusout', onFocusOut);

    const onKeyDown = (event: KeyboardEvent) => {
      const isSave = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's';
      if (!isSave) return;
      event.preventDefault();
      void flush('shortcut');
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      editorDom?.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, editor, shareLinkId, wolkeFilePath, docId]);
}

import { useEffect, useRef } from 'react';
import * as Y from 'yjs';

import { attachYjsBridge, type AwarenessLike } from '../collab/bridge.js';
import { attachSelectionPresence } from '../collab/presence.js';
import { createUniverInstance } from '../lib/createUniverInstance.js';

import './SheetsEditor.css';

import type { FUniver } from '@univerjs/presets';

export interface SheetsEditorProps {
  /** collaborative_documents UUID; also the Hocuspocus room name. */
  documentId: string;
  /** The synced Y.Doc from useCollaboration. Mount only after isSynced. */
  ydoc: Y.Doc;
  awareness?: AwarenessLike | null;
  editable: boolean;
  darkMode?: boolean;
  /** Called with the facade once the instance is live (undo/redo, AI tools). */
  onReady?: (api: FUniver) => void;
}

/**
 * React wrapper around a Univer sheets instance bound to a shared Y.Doc via
 * the mutation-log bridge. One instance per document — remount with
 * `key={documentId}` when switching documents.
 */
export function SheetsEditor({
  documentId,
  ydoc,
  awareness,
  editable,
  darkMode,
  onReady,
}: SheetsEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<FUniver | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const editableRef = useRef(editable);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { univer, univerAPI } = createUniverInstance({ container, darkMode });
    const bridge = attachYjsBridge({
      univerAPI,
      ydoc,
      documentId,
      canWrite: editableRef.current,
      awareness: awareness ?? null,
    });
    if (!editableRef.current) bridge.workbook.setEditable(false);
    const detachPresence = awareness ? attachSelectionPresence(bridge.workbook, awareness) : null;

    apiRef.current = univerAPI;
    onReadyRef.current?.(univerAPI);

    return () => {
      detachPresence?.();
      bridge.dispose();
      apiRef.current = null;
      univerAPI.dispose();
      univer.dispose();
    };
    // darkMode changes are applied reactively below, not by re-creating.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, ydoc, awareness]);

  useEffect(() => {
    editableRef.current = editable;
    apiRef.current?.getActiveWorkbook()?.setEditable(editable);
  }, [editable]);

  useEffect(() => {
    if (darkMode === undefined) return;
    apiRef.current?.toggleDarkMode(darkMode);
  }, [darkMode]);

  return <div ref={containerRef} className="gruenerator-sheets-editor" />;
}

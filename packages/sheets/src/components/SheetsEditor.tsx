import { useEffect, useRef } from 'react';
import * as Y from 'yjs';

import { SHEET_CHART_COMPONENT_KEY } from '../ai/applySheetOperations.js';
import { attachYjsBridge, type AwarenessLike } from '../collab/bridge.js';
import { attachSelectionPresence } from '../collab/presence.js';
import { createUniverInstance, type SheetCurrentUser } from '../lib/createUniverInstance.js';

import { SheetChartFloat } from './SheetChartFloat.js';

import './SheetsEditor.css';

import type { FUniver, IWorkbookData } from '@univerjs/presets';

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
  /** Initial workbook seeded only when the doc has no snapshot yet (templates). */
  seedWorkbook?: Partial<IWorkbookData> | null;
  /** Logged-in user; attributes thread comments/notes. */
  currentUser?: SheetCurrentUser | null;
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
  seedWorkbook,
  currentUser,
}: SheetsEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<FUniver | null>(null);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const editableRef = useRef(editable);
  // Captured once — the seed only applies on first attach, so a changing prop
  // identity must not re-create the instance.
  const seedWorkbookRef = useRef(seedWorkbook);
  // Set once at instance creation; a changing identity must not re-create.
  const currentUserRef = useRef(currentUser);
  // Setter into the live instance, so a user resolving after mount still gets
  // attributed (comments/notes) without re-creating the editor.
  const setCurrentUserRef = useRef<((user: SheetCurrentUser) => void) | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { univer, univerAPI, setCurrentUser } = createUniverInstance({
      container,
      darkMode,
      currentUser: currentUserRef.current,
    });
    setCurrentUserRef.current = setCurrentUser;
    // Register the chart component BEFORE the bridge loads the snapshot, so a
    // workbook that already contains charts renders them on first paint.
    univerAPI.registerComponent(SHEET_CHART_COMPONENT_KEY, SheetChartFloat);
    const bridge = attachYjsBridge({
      univerAPI,
      ydoc,
      documentId,
      canWrite: editableRef.current,
      awareness: awareness ?? null,
      seedWorkbook: seedWorkbookRef.current,
    });
    if (!editableRef.current) bridge.workbook.setEditable(false);
    const detachPresence = awareness ? attachSelectionPresence(bridge.workbook, awareness) : null;

    apiRef.current = univerAPI;
    onReadyRef.current?.(univerAPI);

    return () => {
      detachPresence?.();
      bridge.dispose();
      apiRef.current = null;
      setCurrentUserRef.current = null;
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

  // Re-attribute if the user resolves after the instance was created.
  useEffect(() => {
    if (currentUser) setCurrentUserRef.current?.(currentUser);
  }, [currentUser]);

  return <div ref={containerRef} className="gruenerator-sheets-editor" />;
}

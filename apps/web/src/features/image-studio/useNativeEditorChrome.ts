import {
  type CanvasEditorExportApi,
  type CanvasEditorHostChrome,
} from '@gruenerator/canvas-editor';
import { useMemo, useState, type RefObject } from 'react';

import { useNativeEditorBar } from '../../hooks/useNativeEditorBar';

/**
 * The canvas editor's adapter to `useNativeEditorBar`: undo/redo run through
 * the editor's export api, and share opens the editor's own share menu.
 * Returns the editor's `hostChrome` prop, or undefined when the page draws its
 * own bar.
 */
export function useNativeEditorChrome({
  title,
  canEdit,
  exportApi,
  onRename,
}: {
  title: string | null;
  canEdit: boolean;
  exportApi: RefObject<CanvasEditorExportApi | null>;
  onRename: (title: string) => void;
}): CanvasEditorHostChrome | undefined {
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [shareOpen, setShareOpen] = useState(false);

  const enabled = useNativeEditorBar({
    title,
    canEdit,
    onRename,
    history: {
      ...history,
      undo: () => exportApi.current?.undo(),
      redo: () => exportApi.current?.redo(),
    },
    onShare: () => setShareOpen(true),
  });

  return useMemo(
    () =>
      enabled
        ? { onHistoryChange: setHistory, shareOpen, onShareOpenChange: setShareOpen }
        : undefined,
    [enabled, shareOpen]
  );
}

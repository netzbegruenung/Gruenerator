import {
  type CanvasEditorExportApi,
  type CanvasEditorHostChrome,
} from '@gruenerator/canvas-editor';
import {
  HOST_CAPABILITY_EDITOR_CHROME,
  hostSupports,
  parseHostMessage,
  postToNativeHost,
} from '@gruenerator/shared';
import { useEffect, useMemo, useState, type RefObject } from 'react';

import { isEmbedded } from '../../utils/platform';

/**
 * True when the mobile app draws the canvas editor's top bar natively, so the
 * page must not draw its own. Fixed for the page's lifetime: the host injects
 * its capabilities before the page loads.
 */
export function hasNativeEditorChrome(): boolean {
  return isEmbedded() && hostSupports(HOST_CAPABILITY_EDITOR_CHROME);
}

/**
 * The page's half of the app's native editor bar: reports title and
 * undo/redo to the host, and runs the host's buttons. Returns the editor's
 * `hostChrome` prop, or undefined when the page draws its own bar.
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
  const [enabled] = useState(hasNativeEditorChrome);
  const [history, setHistory] = useState({ canUndo: false, canRedo: false });
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (!enabled || title === null) return;
    postToNativeHost({
      type: 'EDITOR_STATE',
      title,
      canEdit,
      canUndo: canEdit && history.canUndo,
      canRedo: canEdit && history.canRedo,
    });
  }, [enabled, title, canEdit, history]);

  useEffect(() => {
    if (!enabled) return;
    const handleMessage = (event: MessageEvent) => {
      const message = parseHostMessage(event.data);
      if (message?.type === 'EDITOR_COMMAND') {
        if (message.command === 'undo') exportApi.current?.undo();
        else if (message.command === 'redo') exportApi.current?.redo();
        else setShareOpen(true);
      } else if (message?.type === 'EDITOR_RENAME' && canEdit) {
        onRename(message.title);
      }
    };
    // react-native-webview delivers to `document` on Android, `window` on iOS.
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage as EventListener);
    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('message', handleMessage as EventListener);
    };
  }, [enabled, exportApi, canEdit, onRename]);

  return useMemo(
    () =>
      enabled
        ? { onHistoryChange: setHistory, shareOpen, onShareOpenChange: setShareOpen }
        : undefined,
    [enabled, shareOpen]
  );
}

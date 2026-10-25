import {
  type EditorMenuAction,
  HOST_CAPABILITY_EDITOR_CHROME,
  hostSupports,
  parseHostMessage,
  postToNativeHost,
} from '@gruenerator/shared';
import { useEffect, useRef, useState } from 'react';

import { isEmbedded } from '../utils/platform';

/**
 * True when the mobile app draws the editor's top bar natively, so the page
 * must not draw its own. Fixed for the page's lifetime: the host injects its
 * capabilities before the page loads.
 */
export function hasNativeEditorBar(): boolean {
  return isEmbedded() && hostSupports(HOST_CAPABILITY_EDITOR_CHROME);
}

/** An entry of the host's "…" menu, with what it does in the page. */
export interface NativeEditorBarAction extends EditorMenuAction {
  run: () => void;
}

export interface NativeEditorBarOptions {
  /** `null` while the document is still loading: nothing is reported yet. */
  title: string | null;
  /** False for a viewer: no rename, no undo/redo. */
  canEdit: boolean;
  onRename: (title: string) => void;
  /** Left out where the page has no undo/redo at all; the host then shows no buttons. */
  history?: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
  /** Left out where there is nothing to share; the host disables its button. */
  onShare?: () => void;
  /** Everything else the page's own bar offers, in menu order. */
  actions?: readonly NativeEditorBarAction[];
}

/**
 * The page's half of the app's native editor bar, for every editor that the
 * app opens in its WebView: reports title, undo/redo and the menu to the host,
 * and runs the host's buttons. Returns whether the host draws the bar — the
 * page hides its own bar exactly then.
 *
 * One hook for all editors so the bridge is spoken in one place; an editor only
 * says what it has.
 */
export function useNativeEditorBar(options: NativeEditorBarOptions): boolean {
  const [enabled] = useState(hasNativeEditorBar);
  const { title, canEdit, history, onShare, actions = [] } = options;

  // The callbacks change identity on every render of most editors; the
  // listener reads the latest ones instead of re-subscribing each time.
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const canUndo = canEdit && (history?.canUndo ?? false);
  const canRedo = canEdit && (history?.canRedo ?? false);
  const hasHistory = history !== undefined;
  const canShare = onShare !== undefined;
  // Only what the host shows; the `run` closures would make it differ every render.
  const menuKey = JSON.stringify(
    actions.map(({ id, label, destructive, checked }) => ({ id, label, destructive, checked }))
  );

  useEffect(() => {
    if (!enabled || title === null) return;
    postToNativeHost({
      type: 'EDITOR_STATE',
      title,
      canEdit,
      canUndo,
      canRedo,
      history: hasHistory,
      canShare,
      actions: JSON.parse(menuKey) as EditorMenuAction[],
    });
  }, [enabled, title, canEdit, canUndo, canRedo, hasHistory, canShare, menuKey]);

  useEffect(() => {
    if (!enabled) return;
    const handleMessage = (event: MessageEvent) => {
      const message = parseHostMessage(event.data);
      const current = latest.current;
      if (message?.type === 'EDITOR_COMMAND') {
        if (message.command === 'share') current.onShare?.();
        else if (!current.canEdit) return;
        else if (message.command === 'undo') current.history?.undo();
        else current.history?.redo();
      } else if (message?.type === 'EDITOR_RENAME' && current.canEdit) {
        current.onRename(message.title);
      } else if (message?.type === 'EDITOR_ACTION') {
        current.actions?.find((action) => action.id === message.id)?.run();
      }
    };
    // react-native-webview delivers to `document` on Android, `window` on iOS.
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage as EventListener);
    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('message', handleMessage as EventListener);
    };
  }, [enabled]);

  return enabled;
}

import {
  type EditorCommand,
  type EditorMenuAction,
  type WebViewOutboundMessage,
} from '@gruenerator/shared';

import { type HeaderKind } from './hostChrome';

/** What the page last reported for the native editor bar; see `EDITOR_STATE`. */
export type EditorBarState = Omit<
  Extract<WebViewOutboundMessage, { type: 'EDITOR_STATE' }>,
  'type'
>;

/** One icon button on the right of the bar; it sends its id as `EDITOR_COMMAND`. */
export interface EditorBarButton {
  command: EditorCommand;
  label: string;
  /** iOS bar button item. */
  sfSymbol: 'arrow.uturn.backward' | 'arrow.uturn.forward' | 'square.and.arrow.up';
  /** Android, whose toolbar takes no SF Symbols. */
  ionicon: 'arrow-undo-outline' | 'arrow-redo-outline' | 'share-social-outline';
  /** Hidden rather than unmounted, so the iOS bar keeps its items in place. */
  hidden: boolean;
  disabled: boolean;
}

export interface EditorBarModel {
  /** The title opens the rename sheet. */
  canRename: boolean;
  buttons: EditorBarButton[];
  /** The "…" menu's entries; empty means no menu. */
  menu: EditorMenuAction[];
}

/**
 * What the native bar shows, decided once for both platforms: the screen only
 * maps this onto iOS bar button items or Android views.
 *
 * Until the page reports its state, the editor bar shows its buttons disabled
 * — the canvas has all three, and a bar that grows buttons on load jumps. Once
 * the state is in, what the page lacks is hidden: undo/redo for a viewer or a
 * page without history (a board), share where there is nothing to share.
 */
export function buildEditorBar(kind: HeaderKind, state: EditorBarState | null): EditorBarModel {
  if (kind === 'plain') return { canRename: false, buttons: [], menu: [] };
  const noHistory = state !== null && (!state.canEdit || state.history === false);
  const noShare = state?.canShare === false;
  return {
    canRename: state?.canEdit === true,
    buttons: [
      {
        command: 'undo',
        label: 'Rückgängig',
        sfSymbol: 'arrow.uturn.backward',
        ionicon: 'arrow-undo-outline',
        hidden: noHistory,
        disabled: !state?.canUndo,
      },
      {
        command: 'redo',
        label: 'Wiederholen',
        sfSymbol: 'arrow.uturn.forward',
        ionicon: 'arrow-redo-outline',
        hidden: noHistory,
        disabled: !state?.canRedo,
      },
      {
        command: 'share',
        label: 'Teilen und herunterladen',
        sfSymbol: 'square.and.arrow.up',
        ionicon: 'share-social-outline',
        hidden: noShare,
        disabled: state === null,
      },
    ],
    menu: state?.actions ?? [],
  };
}

/**
 * How much of the window the title may take: what the bar's items leave, with
 * room for close on the left and each visible item plus the menu on the right.
 */
export function titleMaxWidth(windowWidth: number, model: EditorBarModel): number {
  const items =
    model.buttons.filter((button) => !button.hidden).length + (model.menu.length > 0 ? 1 : 0);
  return Math.max(96, windowWidth - 108 - 44 * items);
}

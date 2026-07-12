import { Extension } from '@tiptap/core';
import {
  suggestChangesKey,
  transformToSuggestionTransaction,
} from '@handlewithcare/prosemirror-suggest-changes';
import { Plugin, PluginKey } from 'prosemirror-state';
import type { DecorationSet } from 'prosemirror-view';
import type * as Y from 'yjs';

import {
  buildSuggestionDecorations,
  collectNewSuggestionIds,
  generateSuggestionId,
  isSuggestionModeEnabled,
  observeSuggestionMeta,
  writeSuggestionAttribution,
  type SuggestionUser,
} from './suggestionMode';

// Per-author suggestion tinting. Cached in plugin state and rebuilt only on doc
// change or when the attribution map changes (an author color arriving) — never
// on plain selection moves.
const decorationKey = new PluginKey<DecorationSet>('gruenerator-suggest-decorations');

function suggestionDecorationsPlugin(ydoc: Y.Doc): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: decorationKey,
    state: {
      init: (_config, state) => buildSuggestionDecorations(state.doc, ydoc),
      apply: (tr, old) =>
        tr.docChanged || tr.getMeta(decorationKey)
          ? buildSuggestionDecorations(tr.doc, ydoc)
          : old.map(tr.mapping, tr.doc),
    },
    props: {
      decorations: (state) => decorationKey.getState(state),
    },
    view: (editorView) => {
      const unsubscribe = observeSuggestionMeta(ydoc, () => {
        editorView.dispatch(editorView.state.tr.setMeta(decorationKey, true));
      });
      return { destroy: unsubscribe };
    },
  });
}

/**
 * Word-like track-changes interception for the BlockNote editor.
 *
 * BlockNote is built on TipTap, whose extensions support a `dispatchTransaction`
 * middleware (`enableExtensionDispatchTransaction`, on by default). We hook it to
 * replace doc-changing transactions with tracked-suggestion transactions while
 * the doc-wide mode flag is on — mirroring `withSuggestChanges` from the library,
 * but reading the flag from the synced Y.Doc instead of the local plugin state so
 * the mode is genuinely document-wide (Word semantics).
 *
 * The `suggestChanges()` plugin itself (and thus `suggestChangesKey`) is already
 * registered by xl-ai's AIExtension, so we deliberately do NOT register a second
 * copy — we only reuse its key to honor the `skip` meta the apply/revert commands
 * set (otherwise accepting a change would get re-intercepted).
 */
export interface SuggestChangesOptions {
  ydoc: Y.Doc;
  /** Local user for attribution; null until awareness resolves the identity. */
  getUser: () => SuggestionUser | null;
  /** Subscribe to identity changes so deferred attributions can flush; returns unsubscribe. */
  subscribeUser: (cb: () => void) => () => void;
  /** True while AI suggestions are pending on a forked Y.Doc — we hand off then. */
  isAiForked: () => boolean;
}

// BlockNote's extensions array is typed `ExtensionFactoryInstance` (a `(ctx) => Extension`
// factory). We ignore ctx and return the extension object; the array is `any[]` at the
// call site, and this is the one genuine BlockNote-boundary cast.
type ExtensionFactoryInstance = () => {
  key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tiptapExtensions: any[];
  prosemirrorPlugins?: Plugin[];
  mount?: () => () => void;
};

export function SuggestChangesExtension(opts: SuggestChangesOptions): ExtensionFactoryInstance {
  const { ydoc, getUser, subscribeUser, isAiForked } = opts;

  // Ids whose author wasn't resolved at edit time (awareness not yet populated).
  // Flushed on the next edit or on the next identity change — so a suggestion is
  // never left permanently unattributed.
  const pendingIds = new Set<number>();
  const flushPending = () => {
    if (pendingIds.size === 0) return;
    const user = getUser();
    if (!user) return;
    const ids = [...pendingIds];
    pendingIds.clear();
    writeSuggestionAttribution(ydoc, ids, user);
  };

  const tiptapExtension = Extension.create({
    name: 'grueneratorSuggestChanges',
    dispatchTransaction({ transaction: tr, next }) {
      const editor = this.editor;
      const state = editor.state;

      const ySync = (tr.getMeta('y-sync$') ?? {}) as {
        isChangeOrigin?: boolean;
        isUndoRedoOperation?: boolean;
      };
      const suggestMeta = (tr.getMeta(suggestChangesKey) ?? {}) as { skip?: boolean };

      // Same guards as the library's `withSuggestChanges`, plus: our doc-wide
      // Y.Doc flag, editability, and AI-fork hand-off. Remote (`isChangeOrigin`)
      // and undo/redo transactions must pass through untouched — otherwise we'd
      // re-mark already-synced content or fight the undo stack.
      const shouldIntercept =
        tr.docChanged &&
        editor.isEditable &&
        isSuggestionModeEnabled(ydoc) &&
        !isAiForked() &&
        !tr.getMeta('history$') &&
        !tr.getMeta('collab$') &&
        !ySync.isChangeOrigin &&
        !ySync.isUndoRedoOperation &&
        !('skip' in suggestMeta);

      if (!shouldIntercept) {
        next(tr);
        return;
      }

      let tracked;
      try {
        tracked = transformToSuggestionTransaction(tr, state, generateSuggestionId);
      } catch (err) {
        // Never drop the user's edit: fall back to applying it untracked rather
        // than swallowing the transaction if the transform ever throws.
        // eslint-disable-next-line no-console
        console.error('[SuggestChanges] transform failed; applying edit untracked', err);
        next(tr);
        return;
      }

      // Write attribution BEFORE applying the transaction: next() synchronously
      // fires the editor's change/selection listeners (the popover opens from
      // there), so the metadata must already be in the map or the first popover
      // render reads nothing and shows "Unbekannt".
      const newIds = collectNewSuggestionIds(ydoc, tracked);
      if (newIds.length > 0) {
        const user = getUser();
        if (user) writeSuggestionAttribution(ydoc, newIds, user);
        else for (const id of newIds) pendingIds.add(id);
      }
      flushPending();

      next(tracked);
    },
  });

  return () => ({
    key: 'gruenerator-suggest-changes',
    tiptapExtensions: [tiptapExtension],
    prosemirrorPlugins: [suggestionDecorationsPlugin(ydoc)],
    mount: () => subscribeUser(flushPending),
  });
}

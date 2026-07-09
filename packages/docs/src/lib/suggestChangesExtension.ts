import { Extension } from '@tiptap/core';
import {
  suggestChangesKey,
  transformToSuggestionTransaction,
} from '@handlewithcare/prosemirror-suggest-changes';
import type * as Y from 'yjs';

import {
  generateSuggestionId,
  isSuggestionModeEnabled,
  recordSuggestionAttribution,
  type SuggestionUser,
} from './suggestionMode';

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
  /** Awareness user for attribution; null while awareness hasn't populated. */
  getUser: () => SuggestionUser | null;
  /** True while AI suggestions are pending on a forked Y.Doc — we hand off then. */
  isAiForked: () => boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function SuggestChangesExtension(opts: SuggestChangesOptions): (ctx: any) => any {
  const { ydoc, getUser, isAiForked } = opts;

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

      const tracked = transformToSuggestionTransaction(tr, state, generateSuggestionId);
      next(tracked);

      const user = getUser();
      if (user) recordSuggestionAttribution(ydoc, tracked, user);
    },
  });

  return () => ({
    key: 'gruenerator-suggest-changes',
    tiptapExtensions: [tiptapExtension],
  });
}

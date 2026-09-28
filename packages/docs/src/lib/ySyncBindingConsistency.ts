import { createExtension } from '@blocknote/core';
import { Extension } from '@tiptap/core';
import { ySyncPluginKey } from 'y-prosemirror';
import type * as Y from 'yjs';

/**
 * Keep the ySync plugin state's `type`/`doc` in step with its `binding`.
 *
 * BlockNote's AI fork/merge (ForkYDocExtension) swaps the yjs plugins via
 * `replaceExtension`. ProseMirror carries the ySync plugin STATE over (the key
 * is the module-singleton `ySyncPluginKey`), and the new ySync view re-renders
 * synchronously and dispatches `{ binding, isChangeOrigin }` — so for that
 * transaction the state is torn: `binding` maps the NEW fragment's types while
 * `type`/`doc` still name the OLD one. BlockNote only rebinds `type`/`doc`
 * afterwards (`bindYSyncPluginStateTo`).
 *
 * On merge (accept AND reject) the cursor plugin is back in place and reacts to
 * exactly that transaction: y-prosemirror's `createDecorations` resolves every
 * collaborator's cursor in `doc` (the fork) and looks the fork's types up in
 * `binding.mapping` (the original) → "Cannot read properties of undefined
 * (reading 'nodeSize')", thrown out of merge() midway (GlitchTip #659). It only
 * fires while another client has a cursor in awareness.
 *
 * The fix sits on the transaction rather than around merge(): a pre-set state
 * would just move the tear to the cursor plugin's `init`, which runs during the
 * same reconfigure against the still-active OLD binding. Adding `type`/`doc` to
 * the very meta that installs the new binding keeps all three consistent at
 * every step, and matches what BlockNote sets right after anyway.
 */
type YSyncMeta = { binding?: { type?: Y.XmlFragment } | null; type?: unknown };

const tiptapExtension = Extension.create({
  name: 'grueneratorYSyncBindingConsistency',
  dispatchTransaction({ transaction: tr, next }) {
    const meta = tr.getMeta(ySyncPluginKey) as YSyncMeta | undefined;
    const bound = meta?.binding?.type;
    if (meta && bound && !('type' in meta)) {
      // Boundary cast: y-prosemirror's PluginKey is untyped JS.
      const current = ySyncPluginKey.getState(this.editor.state) as { type?: unknown } | undefined;
      if (current && current.type !== bound) {
        tr.setMeta(ySyncPluginKey, { ...meta, type: bound, doc: bound.doc });
      }
    }
    next(tr);
  },
});

export const YSyncBindingConsistencyExtension = createExtension({
  key: 'gruenerator-ysync-binding-consistency',
  tiptapExtensions: [tiptapExtension],
});

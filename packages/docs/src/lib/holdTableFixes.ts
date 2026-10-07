import { createExtension, type ExtensionOptions } from '@blocknote/core';
import { Plugin } from 'prosemirror-state';
import { fixTablesKey } from 'prosemirror-tables';

/**
 * Hold back prosemirror-tables' `fixTables` transactions while a chat-triggered
 * AI edit streams.
 *
 * `fixTables` runs between agent steps and invalidates them ("failed to apply
 * step"). xl-ai filters it itself, but only while `aiMenuState.status ===
 * 'ai-writing'` — and invokeDocumentAI keeps the menu closed on purpose, where
 * `setAIResponseStatus` is a no-op. So the hold is keyed on our own in-flight
 * signal instead. Once the stream ends, the next transaction fixes tables again.
 */
export const HoldTableFixesExtension = createExtension(
  ({ options }: ExtensionOptions<{ isAIWriting: () => boolean }>) => ({
    key: 'gruenerator-hold-table-fixes',
    prosemirrorPlugins: [
      new Plugin({
        filterTransaction: (tr) =>
          !(
            options.isAIWriting() &&
            (tr.getMeta(fixTablesKey) as { fixTables?: unknown } | undefined)?.fixTables
          ),
      }),
    ],
  })
);

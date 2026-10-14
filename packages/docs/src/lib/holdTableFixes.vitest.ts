// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { _getApplySuggestionsTr, AIExtension, StreamToolExecutor } from '@blocknote/xl-ai';
import { describe, expect, it } from 'vitest';

import { HoldTableFixesExtension } from './holdTableFixes';
import { withStructuralUpdateFallback } from './structuralUpdateFallback';

// A chat-triggered edit: the AI menu stays closed (aiMenuState 'closed'), so
// xl-ai's own fixTables filter is off.
async function addTableWithMenuClosed(isAIWriting: () => boolean) {
  const editor = BlockNoteEditor.create({
    extensions: [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      AIExtension({ transport: {} as any }),
      HoldTableFixesExtension({ isAIWriting }),
    ],
  });
  editor.replaceBlocks(editor.document, editor.tryParseMarkdownToBlocks('Hallo Welt'));
  editor.mount(document.createElement('div'));
  const id = editor.document[0].id;

  const executor = new StreamToolExecutor(
    withStructuralUpdateFallback().getStreamTools(editor, undefined)
  );
  const json = JSON.stringify({
    type: 'add',
    referenceId: `${id}$`,
    position: 'after',
    blocks: ['| A | B |\n| - | - |\n| 1 | 2 |'],
  });
  // One complete operation: streamed prefixes of a table add hit a separate
  // failure that the AI menu path shares (#4237).
  const writer = executor.writable.getWriter();
  await writer.write(json);
  await writer.close();
  await executor.finish();

  editor.prosemirrorView!.dispatch(_getApplySuggestionsTr(editor) as never);
  return editor.blocksToMarkdownLossy(editor.document).trim();
}

const normalize = (md: string) => md.replace(/[\s|:-]+/g, ' ').trim();

describe('HoldTableFixesExtension', () => {
  it('lets a chat-triggered edit insert a table', async () => {
    expect(normalize(await addTableWithMenuClosed(() => true))).toBe(
      normalize('Hallo Welt\n\n| A | B |\n| - | - |\n| 1 | 2 |')
    );
  }, 20_000);

  it('fails without the hold (the bug this guards against)', async () => {
    await expect(addTableWithMenuClosed(() => false)).rejects.toThrow(/failed to apply step/);
  }, 20_000);
});

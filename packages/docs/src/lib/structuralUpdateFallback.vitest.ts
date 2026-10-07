// @vitest-environment jsdom
import { BlockNoteEditor } from '@blocknote/core';
import { _getApplySuggestionsTr, AIExtension, StreamToolExecutor } from '@blocknote/xl-ai';
import { describe, expect, it } from 'vitest';

import { withStructuralUpdateFallback } from './structuralUpdateFallback';

async function runUpdate(from: string, to: string) {
  const editor = BlockNoteEditor.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extensions: [AIExtension({ transport: {} as any })],
  });
  editor.replaceBlocks(editor.document, editor.tryParseMarkdownToBlocks(from));
  editor.mount(document.createElement('div'));
  const id = editor.document[0].id;
  // The state the AI menu is in while streaming; xl-ai only holds back its
  // table-fixing plugin (which breaks agent steps on tables) in this state.
  editor
    .getExtension(AIExtension)!
    .store.setState({ aiMenuState: { blockId: id, status: 'ai-writing' } });

  const executor = new StreamToolExecutor(
    withStructuralUpdateFallback().getStreamTools(editor, undefined)
  );
  // Feed growing JSON prefixes, as the LLM stream does.
  const json = JSON.stringify({ type: 'update', id: `${id}$`, block: to });
  const writer = executor.writable.getWriter();
  for (let i = 20; i < json.length; i += 7) await writer.write(json.slice(0, i));
  await writer.write(json);
  await writer.close();
  await executor.finish();

  editor.prosemirrorView!.dispatch(_getApplySuggestionsTr(editor) as never);
  return editor.blocksToMarkdownLossy(editor.document).trim();
}

const normalize = (md: string) => md.replace(/[\s|:-]+/g, ' ').trim();

describe('withStructuralUpdateFallback', () => {
  it.each([
    [
      'adds table rows',
      '| A | B |\n| - | - |\n| 1 | 2 |',
      '| A | B |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |',
    ],
    [
      'adds a table column',
      '| A | B |\n| - | - |\n| 1 | 2 |',
      '| A | B | C |\n| - | - | - |\n| 1 | 2 | 3 |',
    ],
    ['turns a paragraph into a table', 'Hallo Welt', '| A | B |\n| - | - |\n| 1 | 2 |'],
    // character-level path, must stay on the original tool
    [
      'edits table cell text',
      '| Name | Wert |\n| - | - |\n| x | y |',
      '| Name | Wert |\n| - | - |\n| xa | yb |',
    ],
    ['rewrites paragraph text', 'Hallo Welt', 'Hallo schöne Welt'],
  ])(
    '%s',
    async (_name, from, to) => {
      expect(normalize(await runUpdate(from, to))).toBe(normalize(to));
    },
    20_000
  );
});

// Streams an `add` after the single block `Hallo Welt`, one character at a time
// (an LLM delivers tool-call JSON at token granularity).
async function streamAdd(blocks: string[], firstAdd?: string) {
  const editor = BlockNoteEditor.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extensions: [AIExtension({ transport: {} as any })],
  });
  editor.replaceBlocks(editor.document, editor.tryParseMarkdownToBlocks('Hallo Welt'));
  editor.mount(document.createElement('div'));
  const id = editor.document[0].id;
  editor
    .getExtension(AIExtension)!
    .store.setState({ aiMenuState: { blockId: id, status: 'ai-writing' } });

  const executor = new StreamToolExecutor(
    withStructuralUpdateFallback().getStreamTools(editor, undefined)
  );
  const json = JSON.stringify({ type: 'add', referenceId: `${id}$`, position: 'after', blocks });
  const writer = executor.writable.getWriter();
  if (firstAdd) {
    await writer.write(
      JSON.stringify({ type: 'add', referenceId: `${id}$`, position: 'after', blocks: [firstAdd] })
    );
  }
  // After a first add, start inside the table: token streams can skip the
  // `blocks: [""]` state that would otherwise open the operation cleanly.
  for (let i = firstAdd ? json.indexOf('|') + 1 : 20; i <= json.length; i++)
    await writer.write(json.slice(0, i));
  await writer.close();
  await executor.finish();

  editor.prosemirrorView!.dispatch(_getApplySuggestionsTr(editor) as never);
  return editor.blocksToMarkdownLossy(editor.document).trim();
}

describe('withStructuralUpdateFallback — streamed add', () => {
  const table = '| A | B |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |';
  it.each([
    ['a table', [table]],
    ['a table followed by text', [table, 'Danach']],
    ['text then a table', ['Intro', table]],
    ['plain paragraphs', ['Eins', 'Zwei']],
  ])(
    '%s',
    async (_name, blocks) => {
      expect(normalize(await streamAdd(blocks))).toBe(
        normalize(['Hallo Welt', ...blocks].join('\n\n'))
      );
    },
    30_000
  );

  it('a table opening a second add operation leaves the first one alone', async () => {
    expect(normalize(await streamAdd([table], 'Vorher'))).toBe(
      normalize(['Hallo Welt', 'Vorher', table].join('\n\n'))
    );
  }, 30_000);
});

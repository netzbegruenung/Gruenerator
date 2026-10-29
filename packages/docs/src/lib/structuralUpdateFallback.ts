import { aiDocumentFormats, type StreamToolsProvider } from '@blocknote/xl-ai';

const markdownFormat = aiDocumentFormats._experimental_markdown;

type StreamTools = ReturnType<StreamToolsProvider<string>['getStreamTools']>;
type Editor = Parameters<StreamToolsProvider<string>['getStreamTools']>[0];
type StreamToolInstance = StreamTools[number];
type Executor = ReturnType<StreamToolInstance['executor']>;
type Chunk = Parameters<Executor['execute']>[0];
/** A validated `update` operation of the markdown format (id without `$`). */
type UpdateOp = { type: string; id: string; block: string };
/** A validated `add` operation of the markdown format. */
type AddOp = { type: string; blocks: unknown[] };

const isTableText = (block: unknown): block is string =>
  typeof block === 'string' && block.trimStart().startsWith('|');

/**
 * Models often send a table as one string per row. xl-ai parses each string as
 * its own block, so every row would land as a paragraph. A single-line row
 * following a table string is joined onto it; a multi-line string is a table of
 * its own and stays separate.
 */
function joinTableRows(blocks: unknown[]): unknown[] {
  const joined: unknown[] = [];
  for (const block of blocks) {
    const prev = joined[joined.length - 1];
    if (isTableText(block) && !block.includes('\n') && isTableText(prev)) {
      joined[joined.length - 1] = `${prev}\n${block.trim()}`;
    } else {
      joined.push(block);
    }
  }
  return joined;
}

/**
 * The markdown of every block a string holds. xl-ai parses each `update.block`
 * and each `add` string with `tryParseMarkdownToBlocks(md)[0]` and silently
 * drops the rest — still so in 0.56. Models put a heading and its paragraph in
 * one string despite the prompt, so a rewrite lost all its body text. A
 * single-block string comes back unchanged (a multi-line table is one block).
 */
function splitBlocks(editor: Editor, md: string): string[] {
  const blocks = editor.tryParseMarkdownToBlocks(md.trim());
  if (blocks.length <= 1) return [md];
  return blocks.map((block) => editor.blocksToMarkdownLossy([block]).trim());
}

/**
 * Makes `add` insert each block whole.
 *
 * xl-ai streams an `add` by inserting the first parse of a block and then
 * updating it with every later prefix. Most block types pass through states
 * of another type: `-` and `##` are paragraphs before they become a list item
 * or a heading, `| A | B |` alone is no table. xl-ai's update diff cannot
 * change a block's type and its content in one go and throws ("Slice has
 * openStart or openEnd > 0, but structure=false", GlitchTip #706; "Cannot
 * join paragraph onto table", #4237). So the block that is still being
 * streamed — the last one of a partial chunk — is held back and inserted once
 * it is complete, when the next block starts or the stream ends. Inserting
 * still types it in character by character.
 *
 * The add tool resets its list of inserted blocks only on a chunk that starts
 * an operation; if that chunk was held back, the next one passed on must start
 * it instead, or it would update the blocks of the previous operation.
 */
function addBlocksWhole(editor: Editor, tool: StreamToolInstance): StreamToolInstance {
  return {
    ...tool,
    executor: () => {
      const inner = tool.executor();
      let startHeldBack = false;
      return {
        execute: async (chunk: Chunk, signal?: AbortSignal) => {
          const op = chunk.operation as AddOp;
          if (op.type !== 'add') return inner.execute(chunk, signal);

          let blocks = joinTableRows(op.blocks);
          if (chunk.isPossiblyPartial) {
            blocks = blocks.slice(0, -1);
            // A string that has only just opened may still be the next row of
            // the table before it.
            const streaming = op.blocks[op.blocks.length - 1];
            if (typeof streaming === 'string' && !streaming.trim() && isTableText(blocks.at(-1)))
              blocks = blocks.slice(0, -1);
          }
          // Only complete strings are left here, so the split is stable from one
          // chunk to the next and xl-ai's per-index bookkeeping stays aligned.
          blocks = blocks.flatMap((block) =>
            typeof block === 'string' ? splitBlocks(editor, block) : [block]
          );
          if (blocks.length === 0) {
            if (!chunk.isUpdateToPreviousOperation) startHeldBack = true;
            return true;
          }
          const next = { ...chunk, operation: { ...op, blocks } } as Chunk;
          if (!startHeldBack) return inner.execute(next, signal);
          startHeldBack = false;
          return inner.execute({ ...next, isUpdateToPreviousOperation: false }, signal);
        },
      };
    },
  };
}

/**
 * xl-ai's `update` tool replays a block change as a character-level diff. It
 * cannot express structural changes — a table gaining a row or column, a
 * paragraph turning into a table — and throws mid-stream ("Slice has openStart
 * or openEnd > 0, but structure=false", GlitchTip #677; upstream
 * TypeCellOS/BlockNote#2362), which aborts the whole AI edit.
 *
 * When that happens, the same edit is re-expressed with the tools that can:
 * the new block is added BEFORE the old one and the old one is deleted, both
 * as suggestions — the review shows old struck through and new inserted, and
 * accept/reject behave as for any other AI change. `before` keeps the order
 * right when the model later adds blocks `after` the old id.
 */
export function withStructuralUpdateFallback(): StreamToolsProvider<string> {
  const provider = markdownFormat.getStreamToolsProvider();
  return {
    getStreamTools: (editor, selectionInfo, onBlockUpdate) => {
      const tools = provider.getStreamTools(editor, selectionInfo, onBlockUpdate);
      const toolOpts = { idsSuffixed: true, withDelays: true, onBlockUpdate };
      const addTool = markdownFormat.tools.add(editor, toolOpts) as StreamToolInstance;
      const deleteTool = markdownFormat.tools.delete(editor, toolOpts) as StreamToolInstance;

      const withUpdateFallback = tools.map((tool) =>
        tool.name !== 'update'
          ? tool
          : {
              ...tool,
              executor: () => {
                const inner = tool.executor();
                const addExec = addTool.executor();
                const deleteExec = deleteTool.executor();
                let fallbackId: string | null = null;

                const run = async (
                  chunk: Chunk,
                  t: StreamToolInstance,
                  exec: Executor,
                  raw: unknown,
                  signal?: AbortSignal
                ) => {
                  const validated = t.validate(raw as never);
                  if (!validated.ok) throw new Error(String(validated.error));
                  await exec.execute(
                    {
                      ...chunk,
                      operation: validated.value,
                      isPossiblyPartial: false,
                      isUpdateToPreviousOperation: false,
                    } as Chunk,
                    signal
                  );
                };

                const replaceBlock = async (chunk: Chunk, op: UpdateOp, signal?: AbortSignal) => {
                  await run(
                    chunk,
                    addTool,
                    addExec,
                    {
                      type: 'add',
                      referenceId: `${op.id}$`,
                      position: 'before',
                      blocks: splitBlocks(editor, op.block),
                    },
                    signal
                  );
                  await run(
                    chunk,
                    deleteTool,
                    deleteExec,
                    { type: 'delete', id: `${op.id}$` },
                    signal
                  );
                };

                // The update tool has written the first block of a multi-block
                // string; the others go right after it. Known gap: a later
                // `add after` the same id lands between the block and these.
                const addRemainingBlocks = async (
                  chunk: Chunk,
                  op: UpdateOp,
                  signal?: AbortSignal
                ) => {
                  const rest = splitBlocks(editor, op.block).slice(1);
                  if (rest.length === 0) return;
                  await run(
                    chunk,
                    addTool,
                    addExec,
                    { type: 'add', referenceId: `${op.id}$`, position: 'after', blocks: rest },
                    signal
                  );
                };

                return {
                  execute: async (chunk: Chunk, signal?: AbortSignal) => {
                    const op = chunk.operation as UpdateOp;
                    if (op.type !== 'update') return false;

                    if (fallbackId !== op.id) {
                      try {
                        const handled = await inner.execute(chunk, signal);
                        if (handled && !chunk.isPossiblyPartial) {
                          await addRemainingBlocks(chunk, op, signal);
                        }
                        return handled;
                      } catch (error) {
                        if (signal?.aborted) throw error;
                        fallbackId = op.id;
                      }
                    }

                    // Wait for the complete block before replacing it once.
                    if (chunk.isPossiblyPartial) return true;
                    fallbackId = null;
                    await replaceBlock(chunk, op, signal);
                    return true;
                  },
                };
              },
            }
      ) as StreamTools;
      return withUpdateFallback.map((tool) =>
        tool.name === 'add' ? addBlocksWhole(editor, tool) : tool
      ) as StreamTools;
    },
  };
}

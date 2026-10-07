import { aiDocumentFormats, type StreamToolsProvider } from '@blocknote/xl-ai';

const markdownFormat = aiDocumentFormats._experimental_markdown;

type StreamTools = ReturnType<StreamToolsProvider<string>['getStreamTools']>;
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
 * Makes `add` insert each table whole.
 *
 * xl-ai streams an `add` by inserting the first parse of a block and then
 * updating it with every later prefix. A table passes through states that are
 * no table at all (`| A | B |` alone is a paragraph), and the update from
 * paragraph to table throws ("Cannot join paragraph onto table", #4237). So a
 * table that is still the last streamed block is held back and inserted once
 * it is complete — when the stream ends or the next block starts.
 *
 * The add tool resets its list of inserted blocks only on a chunk that starts
 * an operation; if that chunk was held back, the next one passed on must start
 * it instead, or it would update the blocks of the previous operation.
 */
function addTablesWhole(tool: StreamToolInstance): StreamToolInstance {
  return {
    ...tool,
    executor: () => {
      const inner = tool.executor();
      let startHeldBack = false;
      return {
        execute: async (chunk: Chunk, signal?: AbortSignal) => {
          const op = chunk.operation as AddOp;
          if (op.type !== 'add') return inner.execute(chunk, signal);

          const blocks = joinTableRows(op.blocks);
          if (chunk.isPossiblyPartial && isTableText(blocks[blocks.length - 1])) {
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

                const replaceBlock = async (chunk: Chunk, op: UpdateOp, signal?: AbortSignal) => {
                  const run = async (t: StreamToolInstance, exec: Executor, raw: unknown) => {
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
                  await run(addTool, addExec, {
                    type: 'add',
                    referenceId: `${op.id}$`,
                    position: 'before',
                    blocks: [op.block],
                  });
                  await run(deleteTool, deleteExec, { type: 'delete', id: `${op.id}$` });
                };

                return {
                  execute: async (chunk: Chunk, signal?: AbortSignal) => {
                    const op = chunk.operation as UpdateOp;
                    if (op.type !== 'update') return false;

                    if (fallbackId !== op.id) {
                      try {
                        return await inner.execute(chunk, signal);
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
        tool.name === 'add' ? addTablesWhole(tool) : tool
      ) as StreamTools;
    },
  };
}

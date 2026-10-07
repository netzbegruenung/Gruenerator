import { aiDocumentFormats, type StreamToolsProvider } from '@blocknote/xl-ai';

const markdownFormat = aiDocumentFormats._experimental_markdown;

type StreamTools = ReturnType<StreamToolsProvider<string>['getStreamTools']>;
type StreamToolInstance = StreamTools[number];
type Executor = ReturnType<StreamToolInstance['executor']>;
type Chunk = Parameters<Executor['execute']>[0];
/** A validated `update` operation of the markdown format (id without `$`). */
type UpdateOp = { type: string; id: string; block: string };

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

      return tools.map((tool) =>
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
    },
  };
}

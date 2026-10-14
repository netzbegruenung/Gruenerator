/**
 * Which persisted tool calls carry a chat sharepic card. `sharepic` (create)
 * and `edit_sharepic` (loop edit) both persist `result.variants`; every reader
 * of "the thread's sharepic" goes through here so a new producer cannot be
 * forgotten in one of them.
 */
export const SHAREPIC_VARIANT_TOOLS: ReadonlySet<string> = new Set(['sharepic', 'edit_sharepic']);

export function isSharepicVariantTool(toolName: string | undefined): boolean {
  return toolName != null && SHAREPIC_VARIANT_TOOLS.has(toolName);
}

/**
 * The call whose variants the message shows: the LAST one with variants — the
 * live stream replaces the card with every `sharepic_complete`, so a turn that
 * created and then edited ends on the edit.
 */
export function sharepicVariantCall<
  T extends { toolName?: string; result?: { variants?: unknown } | null },
>(toolCalls: readonly T[] | null | undefined): T | undefined {
  for (let i = (toolCalls?.length ?? 0) - 1; i >= 0; i--) {
    const tc = toolCalls![i]!;
    const variants = tc.result?.variants;
    if (isSharepicVariantTool(tc.toolName) && Array.isArray(variants) && variants.length > 0) {
      return tc;
    }
  }
  return undefined;
}

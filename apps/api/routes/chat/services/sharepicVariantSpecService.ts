/**
 * Stores a design variation picked on a chat card (colour, navigation, style)
 * on the creator variant itself, in place — like `attachCanvasIdToMessage`.
 * The next chat edit reads its prior spec from there, and a thread reload
 * renders from there, so neither falls back to the draft as the AI left it.
 */
import { parseSharepicChatProps, type SharepicSpec } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';

type StoredVariant = {
  id?: string;
  canvasId?: string;
  initialProps?: Record<string, unknown>;
  pages?: Record<string, unknown>[];
};
type ToolResults = {
  toolCalls?: Array<{ toolName?: string; result?: { variants?: StoredVariant[] } }>;
};

export type SaveVariantSpecResult = 'saved' | 'not-found' | 'conflict';

/** Same 30-message window the edit resolution reads (sharepicVariantHelpers). */
const WINDOW = 30;

export async function saveCreatorVariantSpec(
  threadId: string,
  userId: string,
  variantId: string,
  spec: SharepicSpec
): Promise<SaveVariantSpecResult> {
  const pg = getPostgresInstance();
  const owned = (await pg.query(
    `SELECT id FROM chat_threads WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [threadId, userId]
  )) as unknown[];
  if (!owned.length) return 'not-found';

  const rows = (await pg.query(
    `SELECT id, tool_results FROM chat_messages
     WHERE thread_id = $1 AND role = 'assistant' AND tool_results IS NOT NULL
     ORDER BY created_at DESC LIMIT ${WINDOW}`,
    [threadId]
  )) as Array<{ id: string; tool_results: unknown }>;

  for (const row of rows) {
    const meta = (
      typeof row.tool_results === 'string' ? JSON.parse(row.tool_results) : row.tool_results
    ) as ToolResults | null;
    const variant = meta?.toolCalls
      ?.filter((tc) => tc?.toolName === 'sharepic')
      .flatMap((tc) => tc.result?.variants ?? [])
      .find((v) => v?.id === variantId);
    if (!variant) continue;

    const props = parseSharepicChatProps(variant.initialProps);
    // Opened in the editor, the card shows the canvas — a spec would not reach it.
    if (!props || variant.canvasId) return 'conflict';
    // A variation changes the look, never the content: same locale, same slides.
    if (
      props.creatorSpec.locale !== spec.locale ||
      props.creatorSpec.slides.length !== spec.slides.length
    )
      return 'conflict';

    variant.initialProps = { ...variant.initialProps, creatorSpec: spec };
    if (variant.pages)
      variant.pages = variant.pages.map((page) => ({ ...page, creatorSpec: spec }));
    await pg.query(`UPDATE chat_messages SET tool_results = $2 WHERE id = $1`, [
      row.id,
      JSON.stringify(meta),
    ]);
    return 'saved';
  }
  return 'not-found';
}

/**
 * Papierkorb for custom prompts. Trash only sets `deleted_at`: the Qdrant
 * point stays until the purge, and every search drops trashed hits against
 * Postgres. `saved_prompts` rows (other users' bookmarks) cascade on purge.
 */
import { type InferSelectModel } from 'drizzle-orm';

import { type customPrompts } from '../../database/schema/generators.js';
import { deleteTrashedRow, purgeSideStore, type OwnedTrashTable } from '../trash/ownedRowTrash.js';

import { getPromptVectorService } from './PromptVectorService.js';

type CustomPromptRow = InferSelectModel<typeof customPrompts>;

export const CUSTOM_PROMPT_TRASH: OwnedTrashTable = {
  table: 'custom_prompts',
  columns: 'id, name AS title',
};

/** Hard-delete a trashed prompt, then its Qdrant point. */
export async function purgeCustomPrompt(id: string, cutoff: Date | null): Promise<boolean> {
  const row = await deleteTrashedRow<Pick<CustomPromptRow, 'id' | 'embedding_id'>>(
    CUSTOM_PROMPT_TRASH,
    id,
    cutoff,
    'id, embedding_id'
  );
  if (!row) return false;
  if (row.embedding_id) {
    await purgeSideStore('custom_prompt', id, 'qdrant', async () => {
      if (!(await getPromptVectorService().deletePromptVector(id))) {
        throw new Error('Prompt vectors could not be deleted');
      }
    });
  }
  return true;
}

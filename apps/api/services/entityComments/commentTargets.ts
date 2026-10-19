/**
 * Who may see a marketplace item, and who owns it — one entry per
 * `EntityCommentType`. Comments, their reactions and the reactions on the item
 * itself all ask here. `entityId` is the item's marketplace `ref`:
 *
 * - `agent`: a user agent's row uuid (`getAccessibleUserAgentById`: owner,
 *   project share, or `authenticated` and not removed) or a system agent's
 *   identifier.
 * - `recipe`: a user recipe's row uuid (own, project share or public) or a
 *   catalogue recipe's mention.
 * - `template`: a user template's uuid or a catalogue Vorlage id (`templateExistsFor`).
 * - `studio_asset`: the owner's, or public and unmoderated (`isStudioAssetVisible`).
 * - `notebook`: a user notebook's uuid, readable per `checkNotebookAccess`
 *   (owner, project share, or `authenticated` and not removed).
 *
 * Official items have no owner. Trashed rows are invisible and unowned.
 */
import { type EntityCommentType } from '@gruenerator/contracts';
import { getSystemAgent, resolveSkillMention } from '@gruenerator/shared/agents';

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { checkNotebookAccess } from '../../routes/notebook/notebookAccess.js';
import { isStudioAssetVisible } from '../studioAssets/studioAssetsService.js';
import { isUserTemplateId, templateExistsFor } from '../templateInteractions/templateTarget.js';
import { isRowId } from '../trash/ownedRowTrash.js';
import { isTextFormVisibleTo } from '../user/textFormRepository.js';
import { getAccessibleUserAgentById } from '../userAgents/userAgentsRepository.js';

export interface CommentTarget {
  canView(userId: string, entityId: string): Promise<boolean>;
  /** The owning user of a live user item; null for official items and unknown ids. */
  ownerId(entityId: string): Promise<string | null>;
}

async function ownerOf(sql: string, table: string, id: string): Promise<string | null> {
  if (!isRowId(id)) return null;
  const row = (await getPostgresInstance().queryOne(sql, [id], { table })) as {
    user_id: string | null;
  } | null;
  return row?.user_id ?? null;
}

let notebookHelper: NotebookQdrantHelper | null = null;

export const commentTargets = {
  agent: {
    async canView(userId, id) {
      if (!isRowId(id)) return getSystemAgent(id) !== undefined;
      return (await getAccessibleUserAgentById(id, userId)) !== undefined;
    },
    ownerId: (id) =>
      ownerOf(
        'SELECT user_id FROM user_agents WHERE id = $1::uuid AND deleted_at IS NULL',
        'user_agents',
        id
      ),
  },
  recipe: {
    async canView(userId, id) {
      if (!isRowId(id)) return resolveSkillMention(id) !== null;
      return isTextFormVisibleTo(id, userId);
    },
    ownerId: (id) =>
      ownerOf(
        'SELECT user_id FROM user_text_forms WHERE id = $1::uuid AND deleted_at IS NULL',
        'user_text_forms',
        id
      ),
  },
  template: {
    canView: (userId, id) => templateExistsFor(userId, id),
    ownerId: (id) =>
      isUserTemplateId(id)
        ? ownerOf(
            'SELECT user_id FROM user_templates WHERE id = $1::uuid AND deleted_at IS NULL',
            'user_templates',
            id
          )
        : Promise.resolve(null),
  },
  studio_asset: {
    canView: (userId, id) => isStudioAssetVisible(userId, id),
    ownerId: (id) =>
      ownerOf(
        'SELECT user_id FROM studio_assets WHERE id = $1::uuid AND deleted_at IS NULL',
        'studio_assets',
        id
      ),
  },
  notebook: {
    async canView(userId, id) {
      return isRowId(id) && (await checkNotebookAccess(id, userId)).canRead;
    },
    async ownerId(id) {
      if (!isRowId(id)) return null;
      const notebook = await (notebookHelper ??= new NotebookQdrantHelper()).getNotebookCollection(
        id
      );
      return notebook && notebook.user_id !== 'SYSTEM' ? notebook.user_id : null;
    },
  },
} satisfies Record<EntityCommentType, CommentTarget>;

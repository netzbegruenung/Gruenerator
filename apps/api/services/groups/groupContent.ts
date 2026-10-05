/**
 * Geteilte Inhalte einer Gruppe — teilen und auflisten — aus dem ts-rest-
 * Handler `groupsContract/content.ts` herausgezogen, aus demselben Grund wie
 * `groupMutations.ts`: die HTTP-Route, die Bestätigungskarte des Chats
 * (`share_notebook` in `confirmController.executeAction`) und das `groups`-
 * Werkzeug (`content`) sollen EINEN Pfad teilen. Der Handler übersetzt nur
 * noch in seinen Contract.
 *
 * `shareContentToGroup`: Besitzprüfung je Typ, Hochstufung eines Notebooks auf
 * share_mode='groups', Doppel-Check, Insert, Benachrichtigung. Die
 * Mitgliedsprüfung wirft (wie `getPostgresAndCheckMembership`), alles andere
 * kommt als Statuscode zurück — so verhielt sich der Handler, und die
 * Antworten sollen sich durch den Umzug nicht ändern.
 *
 * `hydrateGroupContent`: die `group_content_shares`-Zeilen je Typ zu den
 * Datensätzen auflösen, die die Gruppenseite zeigt. Prüft KEINE Mitgliedschaft
 * — beide Aufrufer tun das davor (der Handler über
 * `getPostgresAndCheckMembership`, das Werkzeug über `getGroupForMember`).
 */
import { getSystemAgent } from '@gruenerator/shared/agents';
import { getNotebookDefinition } from '@gruenerator/shared/notebooks';

import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { TRASHABLE_TABLES } from '../../database/trash.js';
import { NextcloudShareManager } from '../../utils/integrations/nextcloud/index.js';
import { getReactionSummaries } from '../entityReactions/EntityReactionsService.js';
import { buildCanvasThumbnailUrl } from '../media/thumbnailUrl.js';
import { notifyGroupMembers } from '../notifications/index.js';
import { listUserAgentsByIds } from '../userAgents/userAgentsRepository.js';

import { assertCanShareToGroup } from './groupMembership.js';
import { normalizeSharePermissions } from './groupSharePermissions.js';

import type { PostgresService } from '../../database/services/PostgresService.js';
import type {
  GroupContentType,
  GroupShareMeta,
  ReactionSummary,
  ShareContentBody,
} from '@gruenerator/contracts';

/** Contract-Typ → Tabelle, wo die beiden auseinanderfallen. */
export const CONTENT_TABLE_NAME_MAP: Record<string, string> = {
  database: 'user_templates',
  template: 'user_templates',
  user_templates: 'user_templates',
  instructions: 'user_instructions',
  user_instructions: 'user_instructions',
  canvas_template: 'collaborative_documents',
};

/** Was in der Benachrichtigung „… hat <Label> geteilt" steht. */
export const CONTENT_LABELS: Record<string, string> = {
  documents: 'ein Dokument',
  custom_generators: 'einen Grünerator',
  notebook_collections: 'ein Notebook',
  user_documents: 'einen Text',
  collaborative_documents: 'ein Dokument',
  database: 'einen Datenbank-Eintrag',
  system_notebooks: 'ein Notebook',
  system_agents: 'einen Agenten',
  user_agents: 'eine*n Agent*in',
  canvas_template: 'eine Sharepic-Vorlage',
  chat_threads: 'einen Chat',
  user_text_forms: 'ein Rezept',
  nextcloud_share_link: 'eine Wolke-Verbindung',
};

export interface ShareContentToGroupInput {
  userId: string;
  contentType: GroupContentType;
  contentId: string;
  groupId: string;
  permissions: ShareContentBody['permissions'];
  /** Notiz für den Gruppen-Feed; leer zählt als keine. */
  note?: string | null;
  /** Anzeigename für die Benachrichtigung der anderen Mitglieder. */
  sharerName: string;
}

export interface ShareContentOutcome {
  status: 200 | 400 | 403 | 404;
  success: boolean;
  message: string;
}

/** Injizierbar, damit der Test ohne Postgres, Qdrant und Nextcloud läuft. */
export interface ShareContentDeps {
  postgres: Pick<PostgresService, 'queryOne' | 'exec'>;
  /** Wirft, wenn `userId` nicht Mitglied von `groupId` ist. */
  checkMembership: (groupId: string, userId: string) => Promise<void>;
  getNotebookCollection: NotebookQdrantHelper['getNotebookCollection'];
  updateNotebookCollection: NotebookQdrantHelper['updateNotebookCollection'];
  getShareLinkById: typeof NextcloudShareManager.getShareLinkById;
  notify: typeof notifyGroupMembers;
}

let notebookHelperSingleton: NotebookQdrantHelper | null = null;

function defaultDeps(): ShareContentDeps {
  const helper = (notebookHelperSingleton ??= new NotebookQdrantHelper());
  return {
    postgres: getPostgresInstance(),
    checkMembership: async (groupId, userId) => {
      await assertCanShareToGroup(groupId, userId);
    },
    getNotebookCollection: (id) => helper.getNotebookCollection(id),
    updateNotebookCollection: (id, patch) => helper.updateNotebookCollection(id, patch),
    getShareLinkById: (userId, id) => NextcloudShareManager.getShareLinkById(userId, id),
    notify: notifyGroupMembers,
  };
}

const NOT_FOUND: ShareContentOutcome = {
  status: 404,
  success: false,
  message: 'Inhalt nicht gefunden.',
};
const NOT_OWNER: ShareContentOutcome = {
  status: 403,
  success: false,
  message: 'Du bist nicht Besitzer*in dieses Inhalts.',
};

export async function shareContentToGroup(
  input: ShareContentToGroupInput,
  deps: ShareContentDeps = defaultDeps()
): Promise<ShareContentOutcome> {
  const { userId, contentType, groupId, permissions, sharerName } = input;
  let { contentId } = input;
  const note = input.note?.trim() || null;
  const { postgres } = deps;
  await deps.checkMembership(groupId, userId);

  if (contentType === 'nextcloud_share_link') {
    try {
      await deps.getShareLinkById(userId, contentId);
    } catch {
      return { status: 404, success: false, message: 'Wolke-Verbindung nicht gefunden.' };
    }
  }

  // System content has no owner row — the registry is its existence check.
  if (contentType === 'system_notebooks' && !getNotebookDefinition(contentId)) return NOT_FOUND;
  if (contentType === 'system_agents') {
    const agent = getSystemAgent(contentId);
    if (!agent) return NOT_FOUND;
    // Store the canonical id: the feed resolves titles without alias lookup.
    contentId = agent.identifier;
  }

  if (contentType === 'notebook_collections') {
    const collection = await deps.getNotebookCollection(contentId);
    if (!collection) return NOT_FOUND;
    if (collection.user_id !== userId) return NOT_OWNER;
    // checkNotebookAccess gates group reads on share_mode='groups' AND a
    // group_content_shares row. This generic share path only writes the
    // row, so a private notebook shared here stays unreadable to members
    // ("Kein Zugriff"). Promote it to 'groups' here, mirroring the notebook
    // share modal (setShareMode → addGroupShare). Leave 'authenticated'
    // alone (members already have read access; demoting would narrow the
    // owner's chosen visibility) and 'groups' alone (already correct).
    // Runs before the existing-share guard below so it also heals notebooks
    // that were shared via this path before the fix.
    if (collection.share_mode !== 'groups' && collection.share_mode !== 'authenticated') {
      await deps.updateNotebookCollection(contentId, { share_mode: 'groups' });
    }
  }

  if (
    contentType !== 'system_notebooks' &&
    contentType !== 'system_agents' &&
    contentType !== 'nextcloud_share_link' &&
    contentType !== 'notebook_collections'
  ) {
    const tableName = CONTENT_TABLE_NAME_MAP[contentType] || contentType;
    const ownerColumn =
      contentType === 'collaborative_documents' || contentType === 'canvas_template'
        ? 'created_by'
        : 'user_id';

    let ownershipSQL = `SELECT ${ownerColumn} FROM ${tableName} WHERE id = $1`;
    const ownershipParams: string[] = [contentId];
    if (tableName === 'user_templates') {
      ownershipSQL += ` AND type = $2`;
      ownershipParams.push('template');
    }
    // A trashed item is invisible everywhere, so it cannot be shared either.
    if (Object.hasOwn(TRASHABLE_TABLES, tableName)) {
      ownershipSQL += ` AND deleted_at IS NULL`;
    }
    if (contentType === 'collaborative_documents') {
      ownershipSQL += ` AND is_deleted = false`;
    }
    if (contentType === 'canvas_template') {
      ownershipSQL += ` AND is_deleted = false AND document_subtype = 'canvas'`;
    }

    const contentOwnership = await postgres.queryOne<{ [key: string]: string }>(
      ownershipSQL,
      ownershipParams,
      { table: tableName }
    );
    if (!contentOwnership) return NOT_FOUND;
    if (contentOwnership[ownerColumn] !== userId) return NOT_OWNER;
  }

  // Same reason as notebooks above: group access to a user agent requires
  // share_mode <> 'private', and the sharing panel lists group shares only in
  // 'groups' mode. Without the promotion this share would be dead and
  // invisible to the owner. After the ownership check, so a non-owner cannot
  // flip someone else's agent.
  if (contentType === 'user_agents') {
    await postgres.exec(
      `UPDATE user_agents SET share_mode = 'groups', updated_at = NOW()
        WHERE id = $1 AND share_mode = 'private'`,
      [contentId]
    );
  }

  const existingShare = await postgres.queryOne<{ id: string }>(
    'SELECT id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
    [contentType, contentId, groupId],
    { table: 'group_content_shares' }
  );
  if (existingShare) {
    return {
      status: 400,
      success: false,
      message: 'Inhalt ist bereits mit dieser Gruppe geteilt.',
    };
  }

  const sharePermissions = normalizeSharePermissions(permissions ?? undefined);
  await postgres.exec(
    'INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions, note) VALUES ($1, $2, $3, $4, $5, $6)',
    [contentType, contentId, groupId, userId, JSON.stringify(sharePermissions), note]
  );

  notifyContentShared({ groupId, userId, sharerName, contentType, contentId }, deps);

  return { status: 200, success: true, message: 'Inhalt erfolgreich mit der Gruppe geteilt.' };
}

/**
 * Meldet einen neu geteilten Inhalt an die übrigen Mitglieder und verlinkt
 * den Beitrag im Feed. Auch für die Freigabe-Wege, die nicht über
 * `shareContentToGroup` laufen (Chats, Notebooks, Agents, Rezepte).
 * Losgelöst: ein Fehler hier darf das Teilen nicht scheitern lassen.
 */
export function notifyContentShared(
  input: {
    groupId: string;
    userId: string;
    /** Fehlt er, steht der Anzeigename aus dem Profil da. */
    sharerName?: string;
    contentType: string;
    contentId: string;
  },
  deps: Pick<ShareContentDeps, 'postgres' | 'notify'> = defaultDeps()
): void {
  const { groupId, userId, sharerName, contentType, contentId } = input;
  void Promise.resolve()
    .then(() =>
      deps.postgres.queryOne<{
        name: string | null;
        share_id: string | null;
        sharer_name: string | null;
      }>(
        `SELECT g.name, s.id AS share_id,
              (SELECT display_name FROM profiles WHERE id = $4) AS sharer_name
         FROM groups g
         LEFT JOIN group_content_shares s
           ON s.group_id = g.id AND s.content_type = $2 AND s.content_id = $3
        WHERE g.id = $1 AND g.deleted_at IS NULL`,
        [groupId, contentType, contentId, userId],
        { table: 'groups' }
      )
    )
    .then((g) =>
      deps.notify({
        groupId,
        excludeUserId: userId,
        type: 'group_content_shared',
        title: 'Neuer Inhalt',
        body: `${sharerName ?? (g?.sharer_name || 'Jemand')} hat ${CONTENT_LABELS[contentType] || 'etwas'} in „${g?.name || 'deinem Projekt'}" geteilt`,
        actionUrl: g?.share_id
          ? `/projekte/${groupId}?beitrag=${g.share_id}`
          : `/projekte/${groupId}`,
        metadata: { contentType, contentId },
      })
    )
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// hydrateGroupContent — aus `listGroupContent` in `groupsContract/content.ts`
// ---------------------------------------------------------------------------

interface ShareRecord {
  share_id: string;
  note: string | null;
  pinned_at: string | Date | null;
  pinned_by_name: string | null;
  comment_count: number | string;
  content_type: string;
  content_id: string;
  shared_at: string;
  permissions: string | Record<string, unknown>;
  shared_by_user_id: string;
  first_name: string | null;
  display_name: string | null;
}

interface ContentItem {
  id: string;
  [key: string]: unknown;
}

function toShareMeta(r: ShareRecord, reactions: ReactionSummary[]): GroupShareMeta {
  return {
    shareId: r.share_id,
    note: r.note,
    pinnedAt: r.pinned_at instanceof Date ? r.pinned_at.toISOString() : r.pinned_at,
    pinnedByName: r.pinned_at ? r.pinned_by_name : null,
    commentCount: Number(r.comment_count) || 0,
    reactions,
  };
}

/** Die Buckets der Gruppenseite; Schlüssel wie in `GroupContentResponse['content']`. */
export interface GroupContentBuckets {
  documents: Record<string, unknown>[];
  generators: Record<string, unknown>[];
  notebooks: Record<string, unknown>[];
  texts: Record<string, unknown>[];
  templates: Record<string, unknown>[];
  collaborative_documents: Record<string, unknown>[];
  system_notebooks: Record<string, unknown>[];
  system_agents: Record<string, unknown>[];
  user_agents: Record<string, unknown>[];
  canvas_templates: Record<string, unknown>[];
  group_posts: Record<string, unknown>[];
}

/** Injizierbar, damit der Test ohne Postgres, Qdrant und Drizzle läuft. */
export interface HydrateGroupContentDeps {
  postgres: Pick<PostgresService, 'query'>;
  getNotebookCollectionsByIds: NotebookQdrantHelper['getNotebookCollectionsByIds'];
  listUserAgentsByIds: typeof listUserAgentsByIds;
  getReactionSummaries: typeof getReactionSummaries;
}

function defaultHydrateDeps(): HydrateGroupContentDeps {
  const helper = (notebookHelperSingleton ??= new NotebookQdrantHelper());
  return {
    postgres: getPostgresInstance(),
    getNotebookCollectionsByIds: (ids) => helper.getNotebookCollectionsByIds(ids),
    listUserAgentsByIds,
    getReactionSummaries,
  };
}

/**
 * Alle mit `groupId` geteilten Inhalte, je Typ zu ihren Datensätzen
 * aufgelöst und um `contentType`, `shared_at`, `group_permissions` und
 * `shared_by_name`/`shared_by_id` ergänzt; `share.reactions` aus Sicht von `viewerId`. Wolke-Verbindungen (`nextcloud_share_link`)
 * haben hier keinen Bucket — sie waren es im Handler nie und tragen den
 * Freigabe-Link, der das Zugangsmittel ist.
 */
export async function hydrateGroupContent(
  groupId: string,
  viewerId: string,
  deps: HydrateGroupContentDeps = defaultHydrateDeps()
): Promise<GroupContentBuckets> {
  const { postgres } = deps;
  const sharedContent =
    ((await postgres.query(
      `SELECT gcs.id AS share_id, gcs.content_type, gcs.content_id, gcs.shared_at, gcs.permissions,
              gcs.shared_by_user_id, p.first_name, p.display_name,
              gcs.note, gcs.pinned_at,
              COALESCE(pp.display_name, pp.first_name) AS pinned_by_name,
              (SELECT COUNT(*) FROM group_share_comments c WHERE c.share_id = gcs.id) AS comment_count
         FROM group_content_shares gcs
         LEFT JOIN profiles p ON p.id = gcs.shared_by_user_id
         LEFT JOIN profiles pp ON pp.id = gcs.pinned_by
        WHERE gcs.group_id = $1
        ORDER BY gcs.shared_at DESC`,
      [groupId],
      { table: 'group_content_shares' }
    )) as ShareRecord[]) || [];

  const contentByType: Record<string, ShareRecord[]> = {
    documents: [],
    custom_generators: [],
    notebook_collections: [],
    user_documents: [],
    database: [],
    collaborative_documents: [],
    system_notebooks: [],
    system_agents: [],
    user_agents: [],
    canvas_template: [],
    group_post: [],
  };
  sharedContent.forEach((share) => {
    if (contentByType[share.content_type]) contentByType[share.content_type].push(share);
  });

  type ContentResult = {
    type: string;
    result: { data: Array<Record<string, unknown>> };
    shares: ShareRecord[];
  };
  const fetchPromises: Promise<ContentResult | null>[] = [];

  if (contentByType.documents.length > 0) {
    const ids = contentByType.documents.map((s) => s.content_id);
    fetchPromises.push(
      postgres
        .query(
          'SELECT id, title, filename, file_size, status, created_at, updated_at, user_id FROM documents WHERE id = ANY($1) AND deleted_at IS NULL',
          [ids],
          { table: 'documents' }
        )
        .then((data) => ({
          type: 'documents',
          result: { data: data || [] },
          shares: contentByType.documents,
        }))
    );
  }
  if (contentByType.custom_generators.length > 0) {
    const ids = contentByType.custom_generators.map((s) => s.content_id);
    fetchPromises.push(
      postgres
        .query(
          'SELECT id, name, title, description, created_at, updated_at, user_id FROM custom_generators WHERE id = ANY($1)',
          [ids],
          { table: 'custom_generators' }
        )
        .then((data) => ({
          type: 'custom_generators',
          result: { data: data || [] },
          shares: contentByType.custom_generators,
        }))
    );
  }
  if (contentByType.notebook_collections.length > 0) {
    const ids = contentByType.notebook_collections.map((s) => s.content_id);
    fetchPromises.push(
      deps.getNotebookCollectionsByIds(ids).then((collections) => ({
        type: 'notebook_collections',
        result: {
          data: collections.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
            // Additiv für das `groups`-Werkzeug: die Notebook-URL ist der Slug,
            // nicht die ID. Der Bucket ist ein Passthrough-Record.
            slug_suffix: c.slug_suffix,
            created_at: c.created_at,
            updated_at: c.updated_at,
            user_id: c.user_id,
          })),
        },
        shares: contentByType.notebook_collections,
      }))
    );
  }
  if (contentByType.system_notebooks.length > 0) {
    fetchPromises.push(
      Promise.resolve({
        type: 'system_notebooks',
        result: {
          data: contentByType.system_notebooks.map((s) => ({ id: s.content_id, system: true })),
        },
        shares: contentByType.system_notebooks,
      })
    );
  }
  if (contentByType.system_agents.length > 0) {
    fetchPromises.push(
      Promise.resolve({
        type: 'system_agents',
        result: {
          data: contentByType.system_agents.map((s) => ({ id: s.content_id, system: true })),
        },
        shares: contentByType.system_agents,
      })
    );
  }
  if (contentByType.user_agents.length > 0) {
    const ids = contentByType.user_agents.map((s) => s.content_id);
    fetchPromises.push(
      deps.listUserAgentsByIds(ids).then((agents) => ({
        type: 'user_agents',
        // Full Agent shape (+ UUID `id` for share-matching). Unlike system
        // agents there is no static registry to resolve against, so the
        // bucket carries the whole agent.
        result: { data: agents as unknown as Array<Record<string, unknown>> },
        shares: contentByType.user_agents,
      }))
    );
  }
  if (contentByType.user_documents.length > 0) {
    const ids = contentByType.user_documents.map((s) => s.content_id);
    fetchPromises.push(
      postgres
        .query(
          'SELECT id, title, document_type, content, created_at, updated_at, user_id FROM user_documents WHERE id = ANY($1) AND deleted_at IS NULL',
          [ids],
          { table: 'user_documents' }
        )
        .then((rawData) => {
          const textsData = ((rawData || []) as Array<ContentItem & { content?: string }>).map(
            (item) => {
              let plainText = item.content || '';
              let prev = '';
              while (prev !== plainText) {
                prev = plainText;
                plainText = plainText.replace(/<[^>]*>/g, '');
              }
              plainText = plainText.trim();
              const wordCount = plainText.split(/\s+/).filter((w) => w.length > 0).length;
              return { ...item, word_count: wordCount, character_count: plainText.length };
            }
          );
          return {
            type: 'user_documents',
            result: { data: textsData },
            shares: contentByType.user_documents,
          };
        })
    );
  }
  if (contentByType.database.length > 0) {
    const ids = contentByType.database.map((s) => s.content_id);
    fetchPromises.push(
      postgres
        .query(
          "SELECT id, title, description, external_url, thumbnail_url, metadata, created_at, updated_at, user_id FROM user_templates WHERE id = ANY($1) AND type = 'template' AND deleted_at IS NULL",
          [ids],
          { table: 'user_templates' }
        )
        .then((data) => ({
          type: 'database',
          result: { data: data || [] },
          shares: contentByType.database,
        }))
    );
  }
  if (contentByType.collaborative_documents.length > 0) {
    const ids = contentByType.collaborative_documents.map((s) => s.content_id);
    fetchPromises.push(
      postgres
        .query(
          `SELECT cd.id, cd.title, cd.document_subtype, cd.created_by, cd.created_at, cd.updated_at,
                  cdoc.thumbnail_url
             FROM collaborative_documents cd
             LEFT JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
            WHERE cd.id = ANY($1::uuid[]) AND cd.is_deleted = false`,
          [ids],
          { table: 'collaborative_documents' }
        )
        .then((data) => ({
          type: 'collaborative_documents',
          result: { data: data || [] },
          shares: contentByType.collaborative_documents,
        }))
    );
  }
  if (contentByType.canvas_template.length > 0) {
    const ids = contentByType.canvas_template.map((s) => s.content_id);
    fetchPromises.push(
      postgres
        .query(
          `SELECT cd.id, cd.title, cd.created_by, cd.created_at, cd.updated_at,
                  cdoc.template_type, cdoc.thumbnail_url, cdoc.format
             FROM collaborative_documents cd
             INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
            WHERE cd.id = ANY($1::uuid[]) AND cd.is_deleted = false AND cd.document_subtype = 'canvas'`,
          [ids],
          { table: 'collaborative_documents' }
        )
        .then((data) => ({
          type: 'canvas_template',
          result: { data: data || [] },
          shares: contentByType.canvas_template,
        }))
    );
  }

  if (contentByType.group_post.length > 0) {
    const ids = contentByType.group_post.map((s) => s.content_id);
    fetchPromises.push(
      postgres
        .query(
          `SELECT p.id, p.body, p.author_id, p.created_at, p.edited_at,
                  COALESCE(
                    json_agg(json_build_object(
                      'id', f.id, 'file_name', f.file_name,
                      'mime_type', f.mime_type, 'size_bytes', f.size_bytes
                    ) ORDER BY f.position) FILTER (WHERE f.id IS NOT NULL),
                    '[]'
                  ) AS files
             FROM group_posts p
             LEFT JOIN group_post_files f ON f.post_id = p.id
            WHERE p.id = ANY($1::uuid[]) AND p.group_id = $2
            GROUP BY p.id`,
          [ids, groupId],
          { table: 'group_posts' }
        )
        .then((data) => ({
          type: 'group_post',
          result: { data: data || [] },
          shares: contentByType.group_post,
        }))
    );
  }

  const [contentResults, reactions] = await Promise.all([
    Promise.all(fetchPromises).then((r) => r.filter(Boolean) as ContentResult[]),
    deps.getReactionSummaries(
      'group_share',
      sharedContent.map((s) => s.share_id),
      viewerId
    ),
  ]);

  const groupContent: GroupContentBuckets = {
    documents: [],
    generators: [],
    notebooks: [],
    texts: [],
    templates: [],
    collaborative_documents: [],
    system_notebooks: [],
    system_agents: [],
    user_agents: [],
    canvas_templates: [],
    group_posts: [],
  };

  const keyMap: Record<string, keyof GroupContentBuckets> = {
    documents: 'documents',
    custom_generators: 'generators',
    notebook_collections: 'notebooks',
    user_documents: 'texts',
    database: 'templates',
    collaborative_documents: 'collaborative_documents',
    system_notebooks: 'system_notebooks',
    system_agents: 'system_agents',
    user_agents: 'user_agents',
    canvas_template: 'canvas_templates',
    group_post: 'group_posts',
  };

  contentResults.forEach(({ type, result, shares }) => {
    const items = (result.data || []).map((item) => {
      const shareInfo = shares.find((s) => s.content_id === item.id);
      const parsedPermissions: Record<string, unknown> =
        typeof shareInfo?.permissions === 'string'
          ? (JSON.parse(shareInfo.permissions) as Record<string, unknown>)
          : ((shareInfo?.permissions as Record<string, unknown> | null) ?? {});
      const parsedMetadata: Record<string, unknown> =
        type === 'database' && item.metadata != null
          ? typeof item.metadata === 'string'
            ? (JSON.parse(item.metadata) as Record<string, unknown>)
            : (item.metadata as Record<string, unknown>)
          : {};
      return {
        ...item,
        contentType: type,
        shared_at: shareInfo?.shared_at,
        group_permissions: parsedPermissions,
        shared_by_name: shareInfo?.display_name || shareInfo?.first_name || 'Unknown User',
        shared_by_id: shareInfo?.shared_by_user_id ?? null,
        share: shareInfo ? toShareMeta(shareInfo, reactions.get(shareInfo.share_id) ?? []) : null,
        ...(type === 'database' && {
          template_type: (parsedMetadata.template_type as string) || 'template',
          external_url: item.external_url,
        }),
        // The stored canvas URL is /api/share/<token>/download, which needs auth
        // an <img> does not send — hand out the signed tile instead.
        ...((type === 'collaborative_documents' || type === 'canvas_template') && {
          thumbnail_url: buildCanvasThumbnailUrl(
            item.id as string,
            (item.thumbnail_url as string | null) ?? null
          ),
        }),
      };
    });
    const key = keyMap[type];
    if (key) groupContent[key] = items;
  });

  return groupContent;
}

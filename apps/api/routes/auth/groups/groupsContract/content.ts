/**
 * Group content-sharing routes (migrated 1:1 from the legacy groupContent.ts).
 * Each handler is bound to its contract route via `s.route(...)` so the spread
 * into `s.router(...)` in `index.ts` stays fully type-inferred.
 */

import { groupsContract } from '@gruenerator/contracts';

import { notifyGroupMembers } from '../../../../services/notifications/index.js';
import { NextcloudShareManager } from '../../../../utils/integrations/nextcloud/index.js';
import { getPostgresAndCheckMembership } from '../groupCore.js';

import {
  s,
  getUserId,
  groupErrorResponse,
  notebookHelper,
  systemTemplates,
  CONTENT_TABLE_NAME_MAP,
  CONTENT_LABELS,
  type ShareRecord,
  type ContentItem,
  type SystemTemplate,
} from './shared.js';

import type { UserProfile } from '../../../../services/user/types.js';

export const contentRoutes = {
  shareContent: s.route(groupsContract.shareContent, async (args) => {
    const { groupId } = args.params;
    const { contentType, contentId, permissions } = args.body;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      if (contentType === 'nextcloud_share_link') {
        try {
          await NextcloudShareManager.getShareLinkById(userId, contentId);
        } catch {
          return {
            status: 404 as const,
            body: { success: false as const, message: 'Wolke-Verbindung nicht gefunden.' },
          };
        }
      }

      if (contentType === 'notebook_collections') {
        const collection = await notebookHelper.getNotebookCollection(contentId);
        if (!collection) {
          return {
            status: 404 as const,
            body: { success: false as const, message: 'Inhalt nicht gefunden.' },
          };
        }
        if (collection.user_id !== userId) {
          return {
            status: 403 as const,
            body: { success: false as const, message: 'Du bist nicht Besitzer*in dieses Inhalts.' },
          };
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

        if (!contentOwnership) {
          return {
            status: 404 as const,
            body: { success: false as const, message: 'Inhalt nicht gefunden.' },
          };
        }
        if (contentOwnership[ownerColumn] !== userId) {
          return {
            status: 403 as const,
            body: { success: false as const, message: 'Du bist nicht Besitzer*in dieses Inhalts.' },
          };
        }
      }

      const existingShare = await postgres.queryOne<{ id: string }>(
        'SELECT id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );
      if (existingShare) {
        return {
          status: 400 as const,
          body: {
            success: false as const,
            message: 'Inhalt ist bereits mit dieser Gruppe geteilt.',
          },
        };
      }

      const sharePermissions = permissions ?? { read: true, write: false, collaborative: false };
      await postgres.exec(
        'INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id, permissions) VALUES ($1, $2, $3, $4, $5)',
        [contentType, contentId, groupId, userId, JSON.stringify(sharePermissions)]
      );

      const sharerName = (args.req.user as UserProfile | undefined)?.display_name || 'Jemand';
      void postgres
        .queryOne('SELECT name FROM groups WHERE id = $1', [groupId], { table: 'groups' })
        .then((g) =>
          notifyGroupMembers({
            groupId,
            excludeUserId: userId,
            type: 'group_content_shared',
            title: 'Neuer Inhalt',
            body: `${sharerName} hat ${CONTENT_LABELS[contentType] || 'etwas'} in „${(g as { name?: string } | null)?.name || 'deiner Gruppe'}" geteilt`,
            actionUrl: `/gruppen/${groupId}`,
            metadata: { contentType, contentId },
          })
        )
        .catch(() => {});

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Inhalt erfolgreich mit der Gruppe geteilt.' },
      };
    } catch (error) {
      return groupErrorResponse('shareContent', 'Fehler beim Teilen des Inhalts.', error);
    }
  }),

  unshareContent: s.route(groupsContract.unshareContent, async (args) => {
    const { groupId } = args.params;
    const { contentType, contentId } = args.body;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      const shareRecord = await postgres.queryOne<{ shared_by_user_id: string }>(
        'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );
      if (!shareRecord) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Geteilter Inhalt nicht gefunden.' },
        };
      }
      if (shareRecord.shared_by_user_id !== userId) {
        return {
          status: 403 as const,
          body: {
            success: false as const,
            message: 'Du kannst nur Inhalte aufheben, die du selbst geteilt hast.',
          },
        };
      }

      const result = await postgres.exec(
        'DELETE FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId]
      );
      if (result.changes === 0) throw new Error('Share record not found or already deleted');

      return {
        status: 200 as const,
        body: {
          success: true as const,
          message: 'Inhalt wurde erfolgreich aus der Gruppe entfernt.',
        },
      };
    } catch (error) {
      return groupErrorResponse(
        'unshareContent',
        'Fehler beim Entfernen des Inhalts aus der Gruppe.',
        error
      );
    }
  }),

  listGroupContent: s.route(groupsContract.listGroupContent, async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      const sharedContent =
        ((await postgres.query(
          `SELECT gcs.content_type, gcs.content_id, gcs.shared_at, gcs.permissions,
                  gcs.shared_by_user_id, p.first_name, p.display_name
             FROM group_content_shares gcs
             LEFT JOIN profiles p ON p.id = gcs.shared_by_user_id
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
        canvas_template: [],
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
              'SELECT id, title, filename, file_size, status, created_at, updated_at, user_id FROM documents WHERE id = ANY($1)',
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
          notebookHelper.getNotebookCollectionsByIds(ids).then((collections) => ({
            type: 'notebook_collections',
            result: {
              data: collections.map((c) => ({
                id: c.id,
                name: c.name,
                description: c.description,
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
      if (contentByType.user_documents.length > 0) {
        const ids = contentByType.user_documents.map((s) => s.content_id);
        fetchPromises.push(
          postgres
            .query(
              'SELECT id, title, document_type, content, created_at, updated_at, user_id FROM user_documents WHERE id = ANY($1)',
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
              "SELECT id, title, description, external_url, thumbnail_url, metadata, created_at, updated_at, user_id FROM user_templates WHERE id = ANY($1) AND type = 'template'",
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
              'SELECT id, title, document_subtype, created_by, created_at, updated_at FROM collaborative_documents WHERE id = ANY($1::uuid[]) AND is_deleted = false',
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

      const contentResults = (await Promise.all(fetchPromises)).filter(Boolean) as ContentResult[];

      const groupContent: {
        documents: Record<string, unknown>[];
        generators: Record<string, unknown>[];
        notebooks: Record<string, unknown>[];
        texts: Record<string, unknown>[];
        templates: Record<string, unknown>[];
        collaborative_documents: Record<string, unknown>[];
        system_notebooks: Record<string, unknown>[];
        system_agents: Record<string, unknown>[];
        canvas_templates: Record<string, unknown>[];
      } = {
        documents: [],
        generators: [],
        notebooks: [],
        texts: [],
        templates: [],
        collaborative_documents: [],
        system_notebooks: [],
        system_agents: [],
        canvas_templates: [],
      };

      const keyMap: Record<string, keyof typeof groupContent> = {
        documents: 'documents',
        custom_generators: 'generators',
        notebook_collections: 'notebooks',
        user_documents: 'texts',
        database: 'templates',
        collaborative_documents: 'collaborative_documents',
        system_notebooks: 'system_notebooks',
        system_agents: 'system_agents',
        canvas_template: 'canvas_templates',
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
            ...(type === 'database' && {
              template_type: (parsedMetadata.template_type as string) || 'template',
              external_url: item.external_url,
            }),
          };
        });
        const key = keyMap[type];
        if (key) groupContent[key] = items;
      });

      return { status: 200 as const, body: { success: true as const, content: groupContent } };
    } catch (error) {
      return groupErrorResponse('listGroupContent', 'Fehler beim Laden der Gruppeninhalte.', error);
    }
  }),

  updateContentPermissions: s.route(groupsContract.updateContentPermissions, async (args) => {
    const { groupId, contentId } = args.params;
    const { contentType, permissions } = args.body;
    try {
      const userId = getUserId(args.req);
      const { postgres, membership } = await getPostgresAndCheckMembership(groupId, userId, false);

      const shareRecord = await postgres.queryOne<{ shared_by_user_id: string }>(
        'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );
      if (!shareRecord) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Inhalt ist nicht mit dieser Gruppe geteilt.' },
        };
      }

      const isAdmin = membership.role === 'admin';
      const isSharer = shareRecord.shared_by_user_id === userId;
      if (!isAdmin && !isSharer) {
        return {
          status: 403 as const,
          body: {
            success: false as const,
            message: 'Keine Berechtigung zum Ändern der Berechtigungen.',
          },
        };
      }

      const result = await postgres.exec(
        'UPDATE group_content_shares SET permissions = $1 WHERE content_type = $2 AND content_id = $3 AND group_id = $4',
        [JSON.stringify(permissions), contentType, contentId, groupId]
      );
      if (result.changes === 0) throw new Error('Share record not found or no changes made');

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Berechtigungen erfolgreich aktualisiert.' },
      };
    } catch (error) {
      return groupErrorResponse(
        'updateContentPermissions',
        'Fehler beim Aktualisieren der Berechtigungen.',
        error
      );
    }
  }),

  removeGroupContent: s.route(groupsContract.removeGroupContent, async (args) => {
    const { groupId, contentId } = args.params;
    const { contentType } = args.body;
    try {
      const userId = getUserId(args.req);
      const { postgres, membership } = await getPostgresAndCheckMembership(groupId, userId, false);

      if (membership.role !== 'admin') {
        return {
          status: 403 as const,
          body: {
            success: false as const,
            message: 'Nur Gruppenadministratoren können geteilte Inhalte entfernen.',
          },
        };
      }

      const shareRecord = await postgres.queryOne<{ shared_by_user_id: string }>(
        'SELECT shared_by_user_id FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId],
        { table: 'group_content_shares' }
      );
      if (!shareRecord) {
        return {
          status: 404 as const,
          body: { success: false as const, message: 'Geteilter Inhalt nicht gefunden.' },
        };
      }

      const result = await postgres.exec(
        'DELETE FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
        [contentType, contentId, groupId]
      );
      if (result.changes === 0) throw new Error('Share record not found or already deleted');

      return {
        status: 200 as const,
        body: { success: true as const, message: 'Inhalt erfolgreich aus der Gruppe entfernt.' },
      };
    } catch (error) {
      return groupErrorResponse(
        'removeGroupContent',
        'Fehler beim Entfernen des geteilten Inhalts.',
        error
      );
    }
  }),

  listGroupVorlagen: s.route(groupsContract.listGroupVorlagen, async (args) => {
    const { groupId } = args.params;
    try {
      const userId = getUserId(args.req);
      const { postgres } = await getPostgresAndCheckMembership(groupId, userId, false);

      const group = await postgres.queryOne(
        'SELECT settings FROM groups WHERE id = $1',
        [groupId],
        {
          table: 'groups',
        }
      );
      const settings =
        typeof group?.settings === 'string'
          ? (JSON.parse(group.settings) as { templateTags?: string[] })
          : ((group?.settings as { templateTags?: string[] } | null) ?? {});
      const templateTags: string[] = settings.templateTags ?? [];

      if (templateTags.length === 0) {
        return {
          status: 200 as const,
          body: { success: true as const, vorlagen: [], tags: [] },
        };
      }

      const dbTemplates = (await postgres.query(
        `SELECT id, title, description, template_type, thumbnail_url, external_url,
                tags, categories, metadata, created_at
           FROM user_templates
          WHERE is_private = false AND status = 'published' AND type = 'template'
            AND tags ?| $1::text[]
          ORDER BY created_at DESC`,
        [templateTags],
        { table: 'user_templates' }
      )) as Array<Record<string, unknown> & SystemTemplate>;

      const lowerTags = templateTags.map((t) => t.toLowerCase());
      const matchingSystemTemplates = systemTemplates
        .filter((t) => {
          const tTags = (t.tags || []).map((tag) => tag.toLowerCase());
          const tCategories = (t.categories || []).map((c) => c.toLowerCase());
          const tType = (t.template_type || '').toLowerCase();
          return lowerTags.some(
            (groupTag) =>
              tTags.includes(groupTag) || tCategories.includes(groupTag) || tType === groupTag
          );
        })
        .map((t) => ({ ...t, is_system: true }));

      const seenIds = new Set<string>();
      const vorlagen: Record<string, unknown>[] = [];
      for (const t of [...(dbTemplates || []), ...matchingSystemTemplates]) {
        if (!seenIds.has(t.id)) {
          seenIds.add(t.id);
          vorlagen.push({
            id: t.id,
            title: t.title,
            description: t.description,
            template_type: t.template_type,
            thumbnail_url: t.thumbnail_url,
            external_url: t.external_url,
            tags: t.tags || [],
            categories: (t as Record<string, unknown>).categories || [],
            is_system: !!(t as { is_system?: boolean }).is_system,
            created_at: 'created_at' in t ? t.created_at : null,
          });
        }
      }

      return {
        status: 200 as const,
        body: { success: true as const, vorlagen, tags: templateTags },
      };
    } catch (error) {
      return groupErrorResponse('listGroupVorlagen', 'Fehler beim Laden der Vorlagen.', error);
    }
  }),
};

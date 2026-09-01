/**
 * Group content-sharing routes (migrated 1:1 from the legacy groupContent.ts).
 * Each handler is bound to its contract route via `s.route(...)` so the spread
 * into `s.router(...)` in `index.ts` stays fully type-inferred.
 */

import { groupsContract, type GroupContentResponse } from '@gruenerator/contracts';

import {
  hydrateGroupContent,
  shareContentToGroup,
} from '../../../../services/groups/groupContent.js';
import { getPostgresAndCheckMembership } from '../groupCore.js';

import { s, getUserId, groupErrorResponse } from './shared.js';

import type { UserProfile } from '../../../../services/user/types.js';

export const contentRoutes = {
  shareContent: s.route(groupsContract.shareContent, async (args) => {
    const { groupId } = args.params;
    const { contentType, contentId, permissions } = args.body;
    try {
      const userId = getUserId(args.req);
      const outcome = await shareContentToGroup({
        userId,
        contentType,
        contentId,
        groupId,
        permissions,
        sharerName: (args.req.user as UserProfile | undefined)?.display_name || 'Jemand',
      });
      switch (outcome.status) {
        case 200:
          return {
            status: 200 as const,
            body: { success: true as const, message: outcome.message },
          };
        case 400:
          return {
            status: 400 as const,
            body: { success: false as const, message: outcome.message },
          };
        case 403:
          return {
            status: 403 as const,
            body: { success: false as const, message: outcome.message },
          };
        case 404:
          return {
            status: 404 as const,
            body: { success: false as const, message: outcome.message },
          };
      }
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
      await getPostgresAndCheckMembership(groupId, userId, false);
      const groupContent = await hydrateGroupContent(groupId);

      // Boundary assertion: the buckets are hydrated as loose records here; the
      // contract types the homogeneous collaborative_documents bucket (id +
      // subtype enum, passthrough). The hydrated rows always carry those fields.
      return {
        status: 200 as const,
        body: {
          success: true as const,
          content: groupContent as unknown as GroupContentResponse['content'],
        },
      };
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
      )) as Array<Record<string, unknown> & { id: string }>;

      const seenIds = new Set<string>();
      const vorlagen: Record<string, unknown>[] = [];
      for (const t of dbTemplates || []) {
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
            categories: t.categories || [],
            is_system: false,
            created_at: t.created_at ?? null,
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

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
import {
  createShareComment,
  deleteShareComment,
  listShareComments,
  updateGroupShare,
  type FeedOutcome,
} from '../../../../services/groups/groupFeed.js';
import { deleteGroupPost, updateGroupPost } from '../../../../services/groups/groupPosts.js';
import { deleteReactionsForShares } from '../../../../services/groups/groupShareReactions.js';
import { getPostgresAndCheckMembership } from '../groupCore.js';

import { s, getUserId, groupErrorResponse } from './shared.js';

import type { UserProfile } from '../../../../services/user/types.js';

/** Fehlerzweig eines Feed-Ergebnisses in die Contract-Antwort übersetzen. */
function feedError(outcome: Extract<FeedOutcome<unknown>, { message: string }>) {
  return { status: outcome.status, body: { success: false as const, message: outcome.message } };
}

export const contentRoutes = {
  shareContent: s.route(groupsContract.shareContent, async (args) => {
    const { groupId } = args.params;
    const { contentType, contentId, permissions, note } = args.body;
    try {
      const userId = getUserId(args.req);
      const outcome = await shareContentToGroup({
        userId,
        contentType,
        contentId,
        groupId,
        permissions,
        note: note ?? null,
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

      await deleteReactionsForShares({ contentTypes: [contentType], contentId, groupId });
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
      const groupContent = await hydrateGroupContent(groupId, userId);

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
      const { postgres, isAdmin } = await getPostgresAndCheckMembership(groupId, userId, false);

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
      const { postgres, isAdmin } = await getPostgresAndCheckMembership(groupId, userId, false);

      if (!isAdmin) {
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

      await deleteReactionsForShares({ contentTypes: [contentType], contentId, groupId });
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
        'SELECT settings FROM groups WHERE id = $1 AND deleted_at IS NULL',
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
            AND deleted_at IS NULL AND tags ?| $1::text[]
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

  updateGroupShare: s.route(groupsContract.updateGroupShare, async (args) => {
    const { groupId, shareId } = args.params;
    try {
      const outcome = await updateGroupShare({
        groupId,
        shareId,
        userId: getUserId(args.req),
        pinned: args.body.pinned ?? null,
        note: args.body.note ?? null,
      });
      if ('message' in outcome) return feedError(outcome);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      return groupErrorResponse('updateGroupShare', 'Fehler beim Ändern des Beitrags.', error);
    }
  }),

  updateGroupPost: s.route(groupsContract.updateGroupPost, async (args) => {
    const { groupId, postId } = args.params;
    try {
      const user = args.req.user as UserProfile | undefined;
      const outcome = await updateGroupPost({
        groupId,
        postId,
        userId: getUserId(args.req),
        authorName: user?.display_name || user?.first_name || 'Jemand',
        body: args.body.body,
      });
      if ('message' in outcome) return feedError(outcome);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      return groupErrorResponse('updateGroupPost', 'Fehler beim Ändern des Beitrags.', error);
    }
  }),

  deleteGroupPost: s.route(groupsContract.deleteGroupPost, async (args) => {
    const { groupId, postId } = args.params;
    try {
      const outcome = await deleteGroupPost({ groupId, postId, userId: getUserId(args.req) });
      if ('message' in outcome) return feedError(outcome);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      return groupErrorResponse('deleteGroupPost', 'Fehler beim Löschen des Beitrags.', error);
    }
  }),

  listGroupShareComments: s.route(groupsContract.listGroupShareComments, async (args) => {
    const { groupId, shareId } = args.params;
    try {
      const outcome = await listShareComments({ groupId, shareId, userId: getUserId(args.req) });
      if ('message' in outcome) return feedError(outcome);
      return { status: 200 as const, body: { success: true as const, comments: outcome.data } };
    } catch (error) {
      return groupErrorResponse(
        'listGroupShareComments',
        'Fehler beim Laden der Kommentare.',
        error
      );
    }
  }),

  createGroupShareComment: s.route(groupsContract.createGroupShareComment, async (args) => {
    const { groupId, shareId } = args.params;
    try {
      const user = args.req.user as UserProfile | undefined;
      const outcome = await createShareComment({
        groupId,
        shareId,
        userId: getUserId(args.req),
        body: args.body.body,
        parentId: args.body.parentId ?? null,
        authorName: user?.display_name || user?.first_name || 'Jemand',
      });
      if ('message' in outcome) return feedError(outcome);
      return { status: 201 as const, body: { success: true as const, comment: outcome.data } };
    } catch (error) {
      return groupErrorResponse(
        'createGroupShareComment',
        'Fehler beim Speichern des Kommentars.',
        error
      );
    }
  }),

  deleteGroupShareComment: s.route(groupsContract.deleteGroupShareComment, async (args) => {
    const { groupId, shareId, commentId } = args.params;
    try {
      const outcome = await deleteShareComment({
        groupId,
        shareId,
        commentId,
        userId: getUserId(args.req),
      });
      if ('message' in outcome) return feedError(outcome);
      return { status: 200 as const, body: { success: true as const } };
    } catch (error) {
      return groupErrorResponse(
        'deleteGroupShareComment',
        'Fehler beim Löschen des Kommentars.',
        error
      );
    }
  }),
};

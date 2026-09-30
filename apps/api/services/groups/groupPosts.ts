/**
 * Eigene Beiträge im Gruppen-Feed: Text und bis zu `GROUP_POST_FILE_LIMIT`
 * Dateien, ohne etwas zu teilen.
 *
 * Jeder Beitrag schreibt zusätzlich eine Zeile in `group_content_shares`
 * (`content_type = 'group_post'`, `content_id = group_posts.id`). Daran hängen
 * Anheften, Kommentare und die Sortierung des Feeds — dieselben Wege wie bei
 * geteilten Inhalten (`groupFeed.ts`, `hydrateGroupContent`). `group_post`
 * steht bewusst NICHT in `groupContentTypeSchema`: Teilen, Aufheben und
 * Entfernen über die Content-Routen würden sonst einen Beitrag ohne seine
 * Share-Zeile (oder umgekehrt) zurücklassen.
 *
 * Rechte: schreiben alle Mitglieder (nicht in Projekten), Text ändern nur
 * die Verfasser*in, löschen Verfasser*in oder Admins.
 */
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { GROUP_POST_FILE_LIMIT, GROUP_POST_MAX } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { isKnownAttachmentType, lookupMime } from '../../utils/fileAttachments.js';
import { createLogger } from '../../utils/logger.js';

import { notifyGroupActivity } from './groupActivityNotifications.js';
import { getViewer, type FeedOutcome } from './groupFeed.js';
import { shareReactionsDeleteSql } from './groupShareReactions.js';

import type { PostgresService } from '../../database/services/PostgresService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = createLogger('group-posts');

export const GROUP_POST_DIR = path.join(__dirname, '../../uploads/group-posts');
export const GROUP_POST_CONTENT_TYPE = 'group_post';

void fs.promises.mkdir(GROUP_POST_DIR, { recursive: true }).catch((err: unknown) => {
  log.error(`Failed to create group post directory: ${(err as Error).message}`);
});

/** Löscht eine gespeicherte Datei; der Name ist unzuverlässig, daher `basename`. */
export async function deleteGroupPostFile(storedFilename: string): Promise<void> {
  await fs.promises
    .unlink(path.join(GROUP_POST_DIR, path.basename(storedFilename)))
    .catch(() => {});
}

export interface GroupPostDeps {
  postgres: Pick<
    PostgresService,
    'query' | 'queryOne' | 'exec' | 'transaction' | 'transactionQueryOne' | 'transactionExec'
  >;
  notify: typeof notifyGroupActivity;
  deleteFile: (storedFilename: string) => Promise<void>;
  /** Only consulted in the system group, where instance admins are the only admins. */
  isInstanceAdmin?: (userId: string) => Promise<boolean>;
}

function defaultDeps(): GroupPostDeps {
  return {
    postgres: getPostgresInstance(),
    notify: notifyGroupActivity,
    deleteFile: deleteGroupPostFile,
  };
}

/** Eine schon auf die Platte geschriebene Datei (multer `diskStorage`). */
export interface UploadedPostFile {
  storedFilename: string;
  originalName: string;
  size: number;
}

const POST_NOT_FOUND = { status: 404 as const, message: 'Beitrag nicht gefunden.' };

export async function createGroupPost(
  input: {
    groupId: string;
    userId: string;
    authorName: string;
    body: string;
    files: UploadedPostFile[];
  },
  deps: GroupPostDeps = defaultDeps()
): Promise<FeedOutcome<{ postId: string; shareId: string }>> {
  const { groupId, userId, authorName, files } = input;
  const body = input.body.trim();
  const { postgres } = deps;

  let isSystem = false;
  const outcome = await (async (): Promise<FeedOutcome<{ postId: string; shareId: string }>> => {
    const viewer = await getViewer(postgres, groupId, userId, deps.isInstanceAdmin);
    isSystem = viewer.isSystem;
    if (viewer.isPersonal) {
      return { status: 400, message: 'In Projekten gibt es keine Beiträge.' };
    }
    if (!viewer.canShare) {
      return { status: 403, message: 'In diesem Projekt können nur Admins Beiträge schreiben.' };
    }
    if (!body && files.length === 0) {
      return { status: 400, message: 'Schreib etwas oder hänge eine Datei an.' };
    }
    if (body.length > GROUP_POST_MAX) {
      return { status: 400, message: `Der Beitrag ist länger als ${GROUP_POST_MAX} Zeichen.` };
    }
    if (files.length > GROUP_POST_FILE_LIMIT) {
      return { status: 400, message: `Höchstens ${GROUP_POST_FILE_LIMIT} Dateien pro Beitrag.` };
    }
    const unknown = files.find((f) => !isKnownAttachmentType(f.originalName));
    if (unknown) {
      return { status: 400, message: `Dateityp nicht erlaubt: ${unknown.originalName}` };
    }

    const ids = await postgres.transaction(async (client) => {
      const post = (await postgres.transactionQueryOne(
        client,
        'INSERT INTO group_posts (group_id, author_id, body) VALUES ($1, $2, $3) RETURNING id',
        [groupId, userId, body]
      )) as { id: string } | null;
      if (!post) throw new Error('Beitrag konnte nicht gespeichert werden.');
      for (const [position, f] of files.entries()) {
        await postgres.transactionExec(
          client,
          `INSERT INTO group_post_files
             (post_id, group_id, stored_filename, file_name, mime_type, size_bytes, position)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            post.id,
            groupId,
            f.storedFilename,
            f.originalName,
            lookupMime(f.originalName),
            f.size,
            position,
          ]
        );
      }
      const share = (await postgres.transactionQueryOne(
        client,
        `INSERT INTO group_content_shares (content_type, content_id, group_id, shared_by_user_id)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [GROUP_POST_CONTENT_TYPE, post.id, groupId, userId]
      )) as { id: string } | null;
      if (!share) throw new Error('Beitrag konnte nicht gespeichert werden.');
      return { postId: post.id, shareId: share.id };
    });
    return { status: 201, data: ids };
  })().catch(async (error: unknown) => {
    await Promise.all(files.map((f) => deps.deleteFile(f.storedFilename)));
    throw error;
  });

  if (outcome.status !== 201) {
    await Promise.all(files.map((f) => deps.deleteFile(f.storedFilename)));
    return outcome;
  }

  void deps.notify({
    groupId,
    authorId: userId,
    authorName,
    body,
    isSystem,
    // Schreiben darf hier nur, wer auch @alle darf (System-Gruppe: Instanz-Admins).
    mayMentionAll: true,
    actionUrl: `/projekte/${groupId}?beitrag=${outcome.data.shareId}`,
    metadata: { contentType: GROUP_POST_CONTENT_TYPE, contentId: outcome.data.postId },
    base: {
      type: 'group_post_created',
      title: 'Neuer Beitrag',
      recipients: 'members',
      ...(body
        ? {}
        : {
            summary:
              files.length === 1
                ? `${authorName} hat eine Datei geteilt`
                : `${authorName} hat ${files.length} Dateien geteilt`,
          }),
    },
  });

  return outcome;
}

interface PostRow {
  id: string;
  author_id: string | null;
  body: string;
  share_id: string | null;
}

async function getPost(
  postgres: GroupPostDeps['postgres'],
  groupId: string,
  postId: string
): Promise<PostRow | null> {
  return (await postgres.queryOne(
    `SELECT p.id, p.author_id, p.body, s.id AS share_id
       FROM group_posts p
       LEFT JOIN group_content_shares s
         ON s.content_type = $3 AND s.content_id = p.id AND s.group_id = p.group_id
      WHERE p.id = $1 AND p.group_id = $2`,
    [postId, groupId, GROUP_POST_CONTENT_TYPE],
    { table: 'group_posts' }
  )) as PostRow | null;
}

export async function updateGroupPost(
  input: { groupId: string; postId: string; userId: string; authorName: string; body: string },
  deps: GroupPostDeps = defaultDeps()
): Promise<FeedOutcome> {
  const { groupId, postId, userId, authorName } = input;
  const body = input.body.trim();
  const { postgres } = deps;
  const viewer = await getViewer(postgres, groupId, userId, deps.isInstanceAdmin);
  const post = await getPost(postgres, groupId, postId);
  if (!post) return POST_NOT_FOUND;
  if (post.author_id !== userId) {
    return { status: 403, message: 'Nur wer den Beitrag geschrieben hat, kann ihn bearbeiten.' };
  }
  if (!body) {
    const files = (await postgres.queryOne(
      'SELECT COUNT(*) AS n FROM group_post_files WHERE post_id = $1',
      [postId],
      { table: 'group_post_files' }
    )) as { n: number | string } | null;
    if (!Number(files?.n)) {
      return { status: 400, message: 'Ein Beitrag ohne Dateien braucht Text.' };
    }
  }
  await postgres.exec(
    'UPDATE group_posts SET body = $1, edited_at = CURRENT_TIMESTAMP WHERE id = $2',
    [body, postId]
  );
  void deps.notify({
    groupId,
    authorId: userId,
    authorName,
    body,
    previousBody: post.body,
    isSystem: viewer.isSystem,
    mayMentionAll: true,
    actionUrl: post.share_id
      ? `/projekte/${groupId}?beitrag=${post.share_id}`
      : `/projekte/${groupId}`,
    metadata: { contentType: GROUP_POST_CONTENT_TYPE, contentId: postId },
    base: null,
  });
  return { status: 200, data: null };
}

export async function deleteGroupPost(
  input: { groupId: string; postId: string; userId: string },
  deps: GroupPostDeps = defaultDeps()
): Promise<FeedOutcome> {
  const { groupId, postId, userId } = input;
  const { postgres } = deps;
  const viewer = await getViewer(postgres, groupId, userId, deps.isInstanceAdmin);
  const post = await getPost(postgres, groupId, postId);
  if (!post) return POST_NOT_FOUND;
  if (!viewer.isAdmin && post.author_id !== userId) {
    return { status: 403, message: 'Du kannst nur eigene Beiträge löschen.' };
  }

  const files = (await postgres.query(
    'SELECT stored_filename FROM group_post_files WHERE post_id = $1',
    [postId],
    { table: 'group_post_files' }
  )) as Array<{ stored_filename: string }>;
  await postgres.transaction(async (client) => {
    // Die Share-Zeile nimmt Anheftung und Kommentare (ON DELETE CASCADE) mit,
    // die Reaktionen daran nicht — die gehen vorher.
    const reactions = shareReactionsDeleteSql({
      contentTypes: [GROUP_POST_CONTENT_TYPE],
      contentId: postId,
      groupId,
    });
    await postgres.transactionExec(client, reactions.sql, reactions.params);
    await postgres.transactionExec(
      client,
      'DELETE FROM group_content_shares WHERE content_type = $1 AND content_id = $2 AND group_id = $3',
      [GROUP_POST_CONTENT_TYPE, postId, groupId]
    );
    await postgres.transactionExec(client, 'DELETE FROM group_posts WHERE id = $1', [postId]);
  });
  await Promise.all(files.map((f) => deps.deleteFile(f.stored_filename)));
  return { status: 200, data: null };
}

export interface GroupPostFileRecord {
  stored_filename: string;
  file_name: string;
  mime_type: string;
}

/** Datei eines Beitrags — nur für Mitglieder (`getViewer` wirft sonst). */
export async function getGroupPostFile(
  input: { groupId: string; postId: string; fileId: string; userId: string },
  deps: Pick<GroupPostDeps, 'postgres'> = defaultDeps()
): Promise<GroupPostFileRecord | null> {
  const { groupId, postId, fileId, userId } = input;
  await getViewer(deps.postgres, groupId, userId);
  return (await deps.postgres.queryOne(
    `SELECT stored_filename, file_name, mime_type FROM group_post_files
      WHERE id = $1 AND post_id = $2 AND group_id = $3`,
    [fileId, postId, groupId],
    { table: 'group_post_files' }
  )) as GroupPostFileRecord | null;
}

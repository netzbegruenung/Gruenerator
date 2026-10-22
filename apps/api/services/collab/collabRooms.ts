/**
 * Hocuspocus room names of shared content, and closing them after an access
 * change. The naming mirrors `checkRoomAccess` in
 * services/hocuspocus/src/auth.ts: a collaborative document's room is its id,
 * a chat thread's is `chat-<id>`, a project's presence room
 * `group-presence-<id>`.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

import { closeCollabRooms } from './hocuspocusInternal.js';

const log = createLogger('collabRooms');

/** Room of a `group_content_shares` content type + id, or null if it has none. */
export function collabRoomForShare(contentType: string, contentId: string): string | null {
  switch (contentType) {
    case 'collaborative_documents':
    case 'canvas_template':
      return contentId;
    case 'chat_threads':
      return `chat-${contentId}`;
    default:
      return null;
  }
}

/** Close the room of one shared item; a no-op for types without a room. Never throws. */
export async function closeShareRoom(contentType: string, contentId: string): Promise<void> {
  const room = collabRoomForShare(contentType, contentId);
  if (room) await closeCollabRooms([room]);
}

/**
 * A project stopped granting access — a member left (`userId`) or the project
 * went to the trash (`null`: everyone). Close the rooms of everything shared
 * with it, plus its presence room. Never throws.
 */
export async function closeGroupCollabRooms(groupId: string, userId: string | null): Promise<void> {
  try {
    const shares = await getPostgresInstance().query<{ content_type: string; content_id: string }>(
      `SELECT content_type, content_id FROM group_content_shares
        WHERE group_id = $1
          AND content_type IN ('collaborative_documents', 'canvas_template', 'chat_threads')`,
      [groupId]
    );
    const rooms = shares
      .map((share) => collabRoomForShare(share.content_type, share.content_id))
      .filter((room): room is string => room !== null);
    await closeCollabRooms([...rooms, `group-presence-${groupId}`], userId);
  } catch (err) {
    log.warn(
      `closing the collab rooms of group ${groupId} failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

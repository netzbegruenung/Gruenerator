import { randomUUID } from 'crypto';

import { createLogger } from './logger.js';
import { SITE_ROOM_PREFIX, siteIdFromRoom } from './siteRooms.js';

import type {
  DbQueryFn,
  RedisLike,
  AuthConfig,
  AuthenticationData,
  AuthenticationResult,
} from './types.js';

const log = createLogger('HocuspocusAuth');

const GRANTED_BY_SHARE_LINK = 'auto:share_link';
const SESSION_CHECK_TIMEOUT_MS = 5000;
/** Same id as the API's dev-bypass user (`apps/api/middleware/authMiddleware.ts`). */
const DEV_BYPASS_USER_ID = '00000000-0000-4000-a000-000000000001';

/** Mirror of `DEV_BYPASS_EXTRA_USERS` in `apps/api/config/devAuthBypass.ts`. */
const DEV_BYPASS_EXTRA_USERS = ['00000000-0000-4000-a000-0000000000b2'];

/**
 * Local dev only, mirroring the API's `requireAuth`: the Vite dev proxy forwards
 * `/ws` here and attaches `x-dev-auth-bypass`, so the bypass user can open its
 * own private documents without a session cookie.
 */
function devBypassUserId(headers: Headers, params?: URLSearchParams): string | null {
  if (process.env.NODE_ENV !== 'development' || process.env.ALLOW_DEV_AUTH_BYPASS !== 'true') {
    return null;
  }
  const expected = process.env.DEV_AUTH_BYPASS_TOKEN;
  if (!expected) return null;
  if (headers.get('x-dev-auth-bypass') !== expected) return null;
  const asUser = params?.get('dev_auth_user');
  return asUser && DEV_BYPASS_EXTRA_USERS.includes(asUser) ? asUser : DEV_BYPASS_USER_ID;
}

/**
 * Inline copy of `classifyRoom` in `packages/collab/src/lib/roomTypes.ts`
 * (hocuspocus has no cross-package deps): `chat-*` and `group-presence-*`
 * rooms are not `collaborative_documents` ids.
 */
function isDocumentRoom(documentName: string): boolean {
  return !documentName.startsWith('chat-') && !documentName.startsWith('group-presence-');
}

const DOCUMENT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AuthService {
  private readonly db: DbQueryFn;
  private readonly redis: RedisLike;

  constructor(config: AuthConfig) {
    this.db = config.db;
    this.redis = config.redis;
  }

  async authenticateConnection(data: AuthenticationData): Promise<AuthenticationResult> {
    const { documentName, requestHeaders, requestParameters, token } = data;

    log.debug(`[Auth] Starting authentication for ${documentName}, hasToken: ${!!token}`);

    try {
      const bypassUserId = devBypassUserId(requestHeaders, requestParameters);
      if (bypassUserId) return this.checkRoomAccess(documentName, bypassUserId);

      if (token) {
        log.debug(`[Auth] Trying bearer-token auth`);
        const result = await this.authenticateByBearer(token, documentName);
        if (result.authenticated) return result;
      }

      log.debug(`[Auth] Trying cookie-based auth`);
      const cookieResult = await this.authenticateByCookie(requestHeaders, documentName);
      if (cookieResult.authenticated) return cookieResult;

      log.debug(`[Auth] Trying guest access`);
      return this.authenticateAsGuest(documentName, requestParameters);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Auth] EXCEPTION: ${err.message}`);
      log.error(`[Auth] Stack trace: ${err.stack}`);
      return {
        authenticated: false,
        reason: 'Internal authentication error',
      };
    }
  }

  private async authenticateAsGuest(
    documentName: string,
    requestParameters: URLSearchParams
  ): Promise<AuthenticationResult> {
    // Guest access exists only for shared documents. Chat and presence rooms
    // would otherwise send their room name into a uuid comparison (#5395).
    if (!isDocumentRoom(documentName) || documentName.startsWith(SITE_ROOM_PREFIX)) {
      return { authenticated: false, reason: 'Guest access is limited to documents' };
    }

    try {
      const result = await this.db(
        `SELECT id, is_public, share_mode, share_permission, is_deleted
         FROM collaborative_documents
         WHERE id = $1`,
        [documentName]
      );

      const doc = result[0];
      if (!doc || doc.is_deleted || (!doc.is_public && doc.share_mode !== 'public')) {
        log.warn(
          `[Auth-Guest] Document ${documentName} not publicly accessible (is_public=${doc?.is_public}, share_mode=${doc?.share_mode})`
        );
        return { authenticated: false, reason: 'Document not publicly accessible' };
      }

      log.info(
        `[Auth-Guest] Document ${documentName} state: is_public=${doc.is_public}, share_mode=${doc.share_mode}`
      );

      const guestId = requestParameters?.get('guestId') || `guest-${randomUUID().slice(0, 8)}`;
      const guestName = requestParameters?.get('guestName') || 'Gast';
      const readOnly = doc.share_permission === 'viewer';

      log.info(
        `[Auth-Guest] Guest ${guestId} (${guestName}) authenticated for ${documentName} (${readOnly ? 'read-only' : 'read-write'})`
      );

      return {
        authenticated: true,
        userId: guestId,
        userName: guestName,
        readOnly,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Auth-Guest] Error checking public access: ${err.message}`);
      return { authenticated: false, reason: 'Failed to check public access' };
    }
  }

  private async getGroupSharePermissions(
    userId: string,
    contentId: string
  ): Promise<{ read?: boolean; write?: boolean } | null> {
    const rows = await this.db(
      `SELECT gcs.permissions FROM group_content_shares gcs
       INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1 AND gm.is_active = TRUE
       INNER JOIN groups lg ON lg.id = gm.group_id AND lg.deleted_at IS NULL
       WHERE gcs.content_type IN ('collaborative_documents', 'canvas_template')
         AND gcs.content_id = $2
       LIMIT 1`,
      [userId, contentId]
    );
    if (rows.length === 0) return null;
    const raw = rows[0].permissions;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
      read?: boolean;
      write?: boolean;
    } | null;
  }

  private async checkRoomAccess(
    documentName: string,
    userId: string
  ): Promise<AuthenticationResult> {
    if (documentName.startsWith('chat-')) {
      const threadId = documentName.replace('chat-', '');
      return this.checkChatThreadAccess(threadId, userId);
    }

    if (documentName.startsWith('group-presence-')) {
      const groupId = documentName.replace('group-presence-', '');
      return this.checkGroupPresenceAccess(groupId, userId);
    }

    if (documentName.startsWith(SITE_ROOM_PREFIX)) {
      return this.checkSiteAccess(documentName, userId);
    }

    return this.checkDocumentPermissions(documentName, userId);
  }

  /** Owner only in this phase; shared editing (Phase 7) extends this one query. */
  private async checkSiteAccess(room: string, userId: string): Promise<AuthenticationResult> {
    const siteId = siteIdFromRoom(room);
    if (!siteId) return { authenticated: false, reason: 'Site not found' };

    const rows = await this.db(
      `SELECT s.user_id, s.moderation FROM user_sites s
       JOIN profiles p ON p.id = s.user_id
       WHERE s.id = $1 AND s.deleted_at IS NULL AND (p.sites_unlocked = true OR p.is_admin = true) LIMIT 1`,
      [siteId]
    );
    const site = rows[0] as { user_id: string; moderation: string | null } | undefined;
    if (!site) {
      log.warn(`[Auth-Site] Site ${siteId} not found, trashed or not unlocked`);
      return { authenticated: false, reason: 'Site not found' };
    }
    if (site.user_id !== userId) {
      log.warn(`[Auth-Site] FAILED: User ${userId} is not the owner of site ${siteId}`);
      return { authenticated: false, reason: 'Access denied' };
    }

    const userResult = await this.db('SELECT display_name FROM profiles WHERE id = $1', [
      userId,
    ]).catch((err) => {
      log.warn(`[Auth-Site] Display name lookup failed for ${userId}: ${err}`);
      return [];
    });
    const readOnly = site.moderation === 'removed';
    log.debug(
      `[Auth-Site] Owner ${userId} authenticated for site ${siteId} (${readOnly ? 'read-only' : 'read-write'})`
    );
    return {
      authenticated: true,
      userId,
      userName: (userResult[0]?.display_name as string) || 'Unknown User',
      readOnly,
    };
  }

  private async checkChatThreadAccess(
    threadId: string,
    userId: string
  ): Promise<AuthenticationResult> {
    log.debug(`[Auth-Chat] Checking thread access: ${threadId} for user: ${userId}`);

    const directAccess = await this.db(
      `SELECT user_id, permissions, is_public, doc_id FROM chat_threads
       WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
      [threadId]
    );

    if ((directAccess as unknown[]).length === 0) {
      log.warn(`[Auth-Chat] Thread ${threadId} not found`);
      return { authenticated: false, reason: 'Thread not found' };
    }

    const thread = directAccess[0] as {
      user_id: string;
      permissions: Record<string, unknown> | null;
      is_public: boolean;
      doc_id: string | null;
    };

    if (thread.doc_id) {
      log.debug(
        `[Auth-Chat] Thread ${threadId} is doc-bound (doc=${thread.doc_id}); delegating to doc permissions`
      );
      return this.checkDocumentPermissions(thread.doc_id, userId);
    }

    // Mirrors ownsThreadSql (apps/api services/groups/projectThreadScope.ts):
    // a team chat of a project the owner has left belongs to the project (#5678).
    const isOwner =
      thread.user_id === userId &&
      (
        await this.db(
          `SELECT 1 FROM chat_threads t
             JOIN groups g ON g.id = t.group_id AND g.deleted_at IS NULL
              AND COALESCE(g.is_active, TRUE) = TRUE
            WHERE t.id = $1 AND t.deleted_at IS NULL
              AND EXISTS (
                SELECT 1 FROM group_content_shares tcs
                 WHERE tcs.content_type = 'chat_threads' AND tcs.content_id = t.id::text
                   AND tcs.group_id = g.id
                   AND COALESCE((tcs.permissions->>'read')::boolean, true) = true
                   AND COALESCE((tcs.permissions->>'write')::boolean, true) = true
              )
              AND NOT EXISTS (
                SELECT 1 FROM group_memberships gm
                 WHERE gm.group_id = g.id AND gm.user_id = $2::uuid AND gm.is_active = TRUE
              )
            LIMIT 1`,
          [threadId, userId]
        )
      ).length === 0;
    const hasDirectPermission = thread.permissions && userId in thread.permissions;
    const isPublic = thread.is_public;

    if (isOwner || hasDirectPermission || isPublic) {
      const userResult = await this.db('SELECT display_name FROM profiles WHERE id = $1', [userId]);
      log.debug(
        `[Auth-Chat] User ${userId} has ${isOwner ? 'owner' : 'direct/public'} access to thread ${threadId}`
      );
      return {
        authenticated: true,
        userId,
        userName: (userResult[0]?.display_name as string) || 'Unknown User',
        readOnly: !isOwner,
      };
    }

    // Mirrors threadAccessService: content_id is TEXT, a share missing its
    // read key counts as readable, a write:false share is read-only.
    // bool_or over zero rows is one row with NULL = no group share.
    const groupAccess = await this.db(
      `SELECT bool_or(COALESCE((gcs.permissions->>'write')::boolean, true)) AS can_write
       FROM group_content_shares gcs
       INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id
       INNER JOIN groups lg ON lg.id = gm.group_id AND lg.deleted_at IS NULL
       WHERE gcs.content_type = 'chat_threads'
       AND gcs.content_id = $1::text
       AND gm.user_id = $2::uuid
       AND gm.is_active = TRUE
       AND COALESCE((gcs.permissions->>'read')::boolean, true) = true`,
      [threadId, userId]
    );

    const groupWrite = (groupAccess[0] as { can_write: boolean | null } | undefined)?.can_write;
    if (groupWrite === true || groupWrite === false) {
      const userResult = await this.db('SELECT display_name FROM profiles WHERE id = $1', [userId]);
      log.debug(`[Auth-Chat] User ${userId} has group access to thread ${threadId}`);
      return {
        authenticated: true,
        userId,
        userName: (userResult[0]?.display_name as string) || 'Unknown User',
        readOnly: !groupWrite,
      };
    }

    log.warn(`[Auth-Chat] FAILED: User ${userId} has no access to thread ${threadId}`);
    return { authenticated: false, reason: 'No access to this chat thread' };
  }

  private async checkGroupPresenceAccess(
    groupId: string,
    userId: string
  ): Promise<AuthenticationResult> {
    log.debug(`[Auth-Presence] Checking group presence: ${groupId} for user: ${userId}`);

    // The system group holds every user and exposes no member info, so it has
    // no presence room: awareness would show who else is online.
    const membership = await this.db(
      `SELECT 1 FROM group_memberships gm JOIN groups g ON g.id = gm.group_id
       WHERE gm.group_id = $1 AND gm.user_id = $2::uuid AND gm.is_active = TRUE
         AND NOT g.is_system AND g.deleted_at IS NULL LIMIT 1`,
      [groupId, userId]
    );

    if ((membership as unknown[]).length === 0) {
      log.warn(
        `[Auth-Presence] FAILED: User ${userId} is not a member of group ${groupId} (or it is the system group)`
      );
      return { authenticated: false, reason: 'Not a member of this group' };
    }

    const userResult = await this.db('SELECT display_name FROM profiles WHERE id = $1', [userId]);
    log.debug(`[Auth-Presence] User ${userId} authenticated for group presence ${groupId}`);
    return {
      authenticated: true,
      userId,
      userName: (userResult[0]?.display_name as string) || 'Unknown User',
      readOnly: false,
    };
  }

  private async checkDocumentPermissions(
    documentName: string,
    userId: string
  ): Promise<AuthenticationResult> {
    log.debug(`[Auth] Checking document permissions for: ${documentName}`);
    // collaborative_documents.id is a uuid: Postgres would reject anything else
    // and the client would retry forever, so deny before querying.
    if (!DOCUMENT_ID_RE.test(documentName)) {
      log.warn(`[Auth] FAILED: ${documentName} is not a document id (user ${userId})`);
      return { authenticated: false, reason: 'Access denied' };
    }
    // The display name is needed on every granted path, so fetch it alongside;
    // a failed lookup must not turn a definite denial into a retryable error.
    const [docResult, userResult] = await Promise.all([
      this.db(
        `SELECT created_by, permissions, is_public, share_mode, share_permission, is_deleted
         FROM collaborative_documents
         WHERE id = $1`,
        [documentName]
      ),
      this.db('SELECT display_name FROM profiles WHERE id = $1', [userId]).catch((err) => {
        log.warn(`[Auth] Display name lookup failed for ${userId}: ${err}`);
        return [];
      }),
    ]);

    log.debug(`[Auth] Document query returned ${docResult.length} results`);

    if (docResult.length === 0) {
      // Every editor inserts its row server-side before returning the id, so a
      // room without one is never legitimate; granting it let any id be opened,
      // including a site's bare uuid, which keys that site's Yjs rows (#5805).
      log.warn(`[Auth] FAILED: no document row for room ${documentName} (user ${userId})`);
      return { authenticated: false, reason: 'Access denied' };
    }

    const document = docResult[0];
    log.debug(
      `[Auth] Document owner: ${document.created_by}, is_public: ${document.is_public}, is_deleted: ${document.is_deleted}`
    );

    if (document.is_deleted) {
      log.warn(`[Auth] FAILED: Document has been deleted`);
      return { authenticated: false, reason: 'Document has been deleted' };
    }

    const isOwner = document.created_by === userId;
    const isPublic = document.is_public;
    const shareMode = (document.share_mode as string) || 'private';
    const sharePermission = (document.share_permission as string) || 'editor';
    const permissions = (document.permissions || {}) as Record<
      string,
      { level?: string } | undefined
    >;
    const userPermission = permissions[userId];

    log.debug(
      `[Auth] isOwner: ${isOwner}, isPublic: ${isPublic}, shareMode: ${shareMode}, userPermission: ${JSON.stringify(userPermission)}`
    );

    let hasAccess = isOwner || isPublic || shareMode === 'authenticated' || userPermission;
    let groupCanEdit: boolean | undefined;

    if (!hasAccess) {
      const groupPerms = await this.getGroupSharePermissions(userId, documentName);
      if (groupPerms) {
        if (groupPerms.read !== false) {
          hasAccess = true;
          groupCanEdit = groupPerms.write === true;
          log.debug(`[Auth] Group access granted (canEdit: ${groupCanEdit})`);
        } else {
          log.warn(`[Auth] Group share found but read=false for user ${userId}, denying`);
        }
      }
    }

    if (!hasAccess) {
      log.warn(`[Auth] FAILED: Access denied - no permission to view document`);
      return { authenticated: false, reason: 'Access denied - no permission to view document' };
    }

    if (shareMode === 'authenticated' && !isOwner && !userPermission) {
      const permissionEntry = JSON.stringify({
        [userId]: {
          level: sharePermission,
          granted_at: new Date().toISOString(),
          granted_by: GRANTED_BY_SHARE_LINK,
        },
      });

      // Awaited so a failed grant is at least visible at error level with the
      // ids needed for follow-up: the user keeps this live session either way,
      // but without the persisted entry they lose access on reconnect.
      try {
        await this.db(
          `UPDATE collaborative_documents
           SET permissions = COALESCE(permissions, '{}')::jsonb || $1::jsonb
           WHERE id = $2
             AND NOT (COALESCE(permissions, '{}')::jsonb ? $3)`,
          [permissionEntry, documentName, userId]
        );
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error(
          `[Auth] Error auto-adding user ${userId} to permissions of ${documentName}: ${error.message}`
        );
      }
    }

    const permissionLevel = userPermission?.level;
    let readOnly: boolean;
    if (isOwner) {
      readOnly = false;
    } else if (permissionLevel) {
      readOnly = permissionLevel === 'viewer';
    } else if (shareMode === 'authenticated' || isPublic) {
      readOnly = sharePermission === 'viewer';
    } else if (groupCanEdit !== undefined) {
      readOnly = !groupCanEdit;
    } else {
      readOnly = true;
    }

    log.debug(
      `[Auth] User ${userId} authenticated for document ${documentName} (${readOnly ? 'read-only' : 'read-write'})`
    );

    return {
      authenticated: true,
      userId,
      userName: (userResult[0]?.display_name as string) || 'Unknown User',
      readOnly,
    };
  }

  private async authenticateByBearer(
    token: string,
    documentName: string
  ): Promise<AuthenticationResult> {
    const apiBase = process.env.API_INTERNAL_URL || 'http://api:3001';
    let userId: string;

    try {
      const response = await fetch(`${apiBase}/api/auth/v2/get-session`, {
        headers: { authorization: `Bearer ${token}` },
        // Fail the handshake fast instead of stalling every connection for
        // Node's default fetch timeout when the API hangs.
        signal: AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS),
      });

      if (!response.ok) {
        log.warn(`[Auth-Bearer] API session check returned ${response.status}`);
        return { authenticated: false, reason: 'Invalid or expired token' };
      }

      const data = (await response.json()) as {
        session?: { userId?: string };
        user?: { id?: string };
      };
      userId = data.session?.userId || data.user?.id || '';

      if (!userId) {
        log.warn(`[Auth-Bearer] API returned session but no user ID`);
        return { authenticated: false, reason: 'Invalid or expired token' };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Auth-Bearer] API session check failed: ${err.message}`);
      return { authenticated: false, reason: 'Session verification failed' };
    }

    log.debug(`[Auth-Bearer] User ${userId} authenticated via Better Auth bearer token`);
    return this.checkRoomAccess(documentName, userId);
  }

  private async authenticateByCookie(
    requestHeaders: Headers,
    documentName: string
  ): Promise<AuthenticationResult> {
    const cookieHeader = requestHeaders.get('cookie');
    log.debug(`[Auth-Cookie] Cookie header exists: ${!!cookieHeader}`);

    if (!cookieHeader) {
      return { authenticated: false, reason: 'No session cookie provided' };
    }

    log.debug(`[Auth-Cookie] Verifying session via API`);

    const apiBase = process.env.API_INTERNAL_URL || 'http://api:3001';
    let userId: string;

    try {
      const response = await fetch(`${apiBase}/api/auth/v2/get-session`, {
        headers: { cookie: cookieHeader },
        signal: AbortSignal.timeout(SESSION_CHECK_TIMEOUT_MS),
      });

      if (!response.ok) {
        log.warn(`[Auth-Cookie] API session check returned ${response.status}`);
        return { authenticated: false, reason: 'Session not found or expired' };
      }

      const data = (await response.json()) as {
        session?: { userId?: string };
        user?: { id?: string };
      };
      userId = data.session?.userId || data.user?.id || '';

      if (!userId) {
        log.warn(`[Auth-Cookie] API returned session but no user ID`);
        return { authenticated: false, reason: 'Session not found or expired' };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error(`[Auth-Cookie] API session check failed: ${err.message}`);
      return { authenticated: false, reason: 'Session verification failed' };
    }

    log.debug(`[Auth-Cookie] User ID from session: ${userId}`);
    return this.checkRoomAccess(documentName, userId);
  }
}

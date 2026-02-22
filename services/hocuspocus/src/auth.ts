import { randomUUID } from 'crypto';

import { parse as parseCookie } from 'cookie';
import { jwtVerify } from 'jose';

import { createLogger } from './logger.js';

import type {
  DbQueryFn,
  RedisLike,
  AuthConfig,
  AuthenticationData,
  AuthenticationResult,
} from './types.js';

const log = createLogger('HocuspocusAuth');

export class AuthService {
  private readonly db: DbQueryFn;
  private readonly redis: RedisLike;
  private readonly jwtSecret: Uint8Array;

  constructor(config: AuthConfig) {
    this.db = config.db;
    this.redis = config.redis;
    this.jwtSecret = new TextEncoder().encode(config.sessionSecret);
  }

  async authenticateConnection(data: AuthenticationData): Promise<AuthenticationResult> {
    const { documentName, requestHeaders, requestParameters, token } = data;

    log.info(`[Auth] ========== Starting authentication ==========`);
    log.info(`[Auth] Document: ${documentName}, hasToken: ${!!token}`);

    try {
      if (token) {
        log.info(`[Auth] Using token-based authentication`);
        const result = await this.authenticateByToken(token, documentName);
        if (result.authenticated) {
          log.info(`[Auth] ========== Authentication complete ==========`);
          return result;
        }
      }

      log.info(`[Auth] Using cookie-based authentication`);
      const cookieResult = await this.authenticateByCookie(requestHeaders, documentName);
      if (cookieResult.authenticated) {
        log.info(`[Auth] ========== Authentication complete ==========`);
        return cookieResult;
      }

      log.info(`[Auth] Auth methods failed, trying guest access for public document`);
      const guestResult = await this.authenticateAsGuest(documentName, requestParameters);
      log.info(`[Auth] ========== Authentication complete ==========`);
      return guestResult;
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
    try {
      const result = await this.db(
        `SELECT id, is_public, share_permission, is_deleted
         FROM collaborative_documents
         WHERE id = $1`,
        [documentName]
      );

      if (result.length === 0 || result[0].is_deleted || !result[0].is_public) {
        log.warn(`[Auth-Guest] Document ${documentName} not publicly accessible`);
        return { authenticated: false, reason: 'Document not publicly accessible' };
      }

      const guestId = requestParameters?.get('guestId') || `guest-${randomUUID().slice(0, 8)}`;
      const guestName = requestParameters?.get('guestName') || 'Gast';
      const readOnly = result[0].share_permission === 'viewer';

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

  async canEditDocument(documentId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.db(
        `SELECT created_by, permissions, share_mode, share_permission
         FROM collaborative_documents
         WHERE id = $1 AND document_subtype = 'docs' AND is_deleted = false`,
        [documentId]
      );

      if (result.length === 0) {
        return false;
      }

      const document = result[0];
      const isOwner = document.created_by === userId;
      const permissions = (document.permissions || {}) as Record<
        string,
        { level?: string } | undefined
      >;
      const userPermission = permissions[userId];

      if (isOwner) return true;

      if (
        userPermission?.level !== undefined &&
        ['owner', 'editor'].includes(userPermission.level)
      ) {
        return true;
      }

      const shareMode = (document.share_mode as string) || 'private';
      const sharePermission = (document.share_permission as string) || 'editor';
      if (shareMode === 'authenticated' && sharePermission === 'editor') {
        return true;
      }

      const groupResult = await this.db(
        `SELECT gcs.permissions FROM group_content_shares gcs
         INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1
         WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2 LIMIT 1`,
        [userId, documentId]
      );

      if (groupResult.length > 0) {
        const groupPerms = (
          typeof groupResult[0].permissions === 'string'
            ? JSON.parse(groupResult[0].permissions)
            : groupResult[0].permissions
        ) as { read?: boolean; write?: boolean } | null;
        if (groupPerms?.write === true) {
          return true;
        }
      }

      return false;
    } catch (error) {
      log.error(`[CanEdit] Error checking edit permission: ${error}`);
      return false;
    }
  }

  private async checkDocumentPermissions(
    documentName: string,
    userId: string
  ): Promise<AuthenticationResult> {
    log.info(`[Auth] Checking document permissions for: ${documentName}`);
    const docResult = await this.db(
      `SELECT created_by, permissions, is_public, share_mode, share_permission, is_deleted
       FROM collaborative_documents
       WHERE id = $1 AND document_subtype = 'docs'`,
      [documentName]
    );

    log.info(`[Auth] Document query returned ${docResult.length} results`);

    if (docResult.length === 0) {
      log.info(
        `[Auth] Document ${documentName} doesn't exist, allowing authenticated user ${userId} to create it`
      );

      const userResult = await this.db('SELECT display_name FROM profiles WHERE id = $1', [userId]);

      log.info(`[Auth] SUCCESS: User ${userId} authenticated for new document (read-write)`);
      return {
        authenticated: true,
        userId,
        userName: (userResult[0]?.display_name as string) || 'Unknown User',
        readOnly: false,
      };
    }

    const document = docResult[0];
    log.info(
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

    log.info(
      `[Auth] isOwner: ${isOwner}, isPublic: ${isPublic}, shareMode: ${shareMode}, userPermission: ${JSON.stringify(userPermission)}`
    );

    let hasAccess = isOwner || isPublic || shareMode === 'authenticated' || userPermission;
    let groupCanEdit: boolean | undefined;

    if (!hasAccess) {
      const groupResult = await this.db(
        `SELECT gcs.permissions FROM group_content_shares gcs
         INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1
         WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = $2 LIMIT 1`,
        [userId, documentName]
      );

      if (groupResult.length > 0) {
        hasAccess = true;
        const groupPerms = (
          typeof groupResult[0].permissions === 'string'
            ? JSON.parse(groupResult[0].permissions)
            : groupResult[0].permissions
        ) as { read?: boolean; write?: boolean } | null;
        groupCanEdit = groupPerms?.write === true;
        log.info(`[Auth] Group access granted (canEdit: ${groupCanEdit})`);
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
          granted_by: 'auto:share_link',
        },
      });

      this.db(
        `UPDATE collaborative_documents
         SET permissions = COALESCE(permissions, '{}')::jsonb || $1::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
           AND NOT (COALESCE(permissions, '{}')::jsonb ? $3)`,
        [permissionEntry, documentName, userId]
      ).catch((err: unknown) => {
        const error = err instanceof Error ? err : new Error(String(err));
        log.error(`[Auth] Error auto-adding user to permissions: ${error.message}`);
      });
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

    const userResult = await this.db('SELECT display_name FROM profiles WHERE id = $1', [userId]);

    log.info(
      `[Auth] SUCCESS: User ${userId} authenticated for document ${documentName} (${readOnly ? 'read-only' : 'read-write'})`
    );

    return {
      authenticated: true,
      userId,
      userName: (userResult[0]?.display_name as string) || 'Unknown User',
      readOnly,
    };
  }

  private async authenticateByToken(
    token: string,
    documentName: string
  ): Promise<AuthenticationResult> {
    try {
      const { payload } = await jwtVerify(token, this.jwtSecret, {
        issuer: 'gruenerator-api',
        audience: 'gruenerator-app',
      });

      if (!payload.sub) {
        log.warn(`[Auth-Token] FAILED: Token missing sub claim`);
        return { authenticated: false, reason: 'Invalid token: missing user ID' };
      }

      const userId = payload.sub as string;
      log.info(`[Auth-Token] Token validated for user: ${userId}`);

      return this.checkDocumentPermissions(documentName, userId);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.warn(`[Auth-Token] JWT validation failed: ${err.message}`);
      return { authenticated: false, reason: 'Invalid or expired token' };
    }
  }

  private async authenticateByCookie(
    requestHeaders: Record<string, string | string[] | undefined>,
    documentName: string
  ): Promise<AuthenticationResult> {
    const cookieHeader = requestHeaders.cookie;
    log.info(`[Auth-Cookie] Cookie header exists: ${!!cookieHeader}`);

    if (!cookieHeader || typeof cookieHeader !== 'string') {
      return { authenticated: false, reason: 'No session cookie provided' };
    }

    const cookies = parseCookie(cookieHeader);
    const sessionCookie = cookies['gruenerator.sid'];

    if (!sessionCookie) {
      return { authenticated: false, reason: 'No session cookie found' };
    }

    const sessionId = sessionCookie.startsWith('s:')
      ? sessionCookie.substring(2).split('.')[0]
      : sessionCookie;

    if (!sessionId) {
      return { authenticated: false, reason: 'Invalid session cookie format' };
    }

    const sessionKey = `sess:${sessionId}`;
    log.info(`[Auth-Cookie] Looking up session: ${sessionKey.substring(0, 15)}...`);

    if (!this.redis.isReady) {
      log.error(`[Auth-Cookie] FAILED: Redis client not ready`);
      return { authenticated: false, reason: 'Session store unavailable' };
    }

    const sessionString = await this.redis.get(sessionKey);

    if (!sessionString) {
      log.warn(`[Auth-Cookie] Session not found or expired`);
      return { authenticated: false, reason: 'Session not found or expired' };
    }

    const sessionData = JSON.parse(
      typeof sessionString === 'string' ? sessionString : JSON.stringify(sessionString)
    );

    const userId = sessionData?.passport?.user?.id || sessionData?.passport?.user;

    if (!userId) {
      log.warn(`[Auth-Cookie] User not authenticated in session`);
      return { authenticated: false, reason: 'User not authenticated in session' };
    }

    log.info(`[Auth-Cookie] User ID from session: ${userId}`);
    return this.checkDocumentPermissions(documentName, userId);
  }
}

import { parse as parseCookie } from 'cookie';
import { jwtVerify } from 'jose';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';

const log = createLogger('HocuspocusAuth');
const db = getPostgresInstance();

const JWT_SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || 'fallback-secret-please-change'
);

interface AuthenticationData {
  documentName: string;
  requestHeaders: Record<string, string | string[] | undefined>;
  requestParameters: URLSearchParams;
  connection: any;
  token?: string;
}

interface AuthenticationResult {
  authenticated: boolean;
  userId?: string;
  userName?: string;
  readOnly?: boolean;
  reason?: string;
}

/**
 * Check document permissions and return auth result for a verified user.
 * Shared by both cookie-based and token-based auth paths.
 */
async function checkDocumentPermissions(
  documentName: string,
  userId: string
): Promise<AuthenticationResult> {
  log.info(`[Auth] Checking document permissions for: ${documentName}`);
  const docResult = await db.query(
    `SELECT created_by, permissions, is_public, is_deleted
     FROM collaborative_documents
     WHERE id = $1 AND document_subtype = 'docs'`,
    [documentName]
  );

  log.info(`[Auth] Document query returned ${docResult.length} results`);

  if (docResult.length === 0) {
    log.info(
      `[Auth] Document ${documentName} doesn't exist, allowing authenticated user ${userId} to create it`
    );

    const userResult = await db.query('SELECT display_name FROM profiles WHERE id = $1', [userId]);

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
  const permissions = (document.permissions || {}) as Record<
    string,
    { level?: string } | undefined
  >;
  const userPermission = permissions[userId];

  log.info(
    `[Auth] isOwner: ${isOwner}, isPublic: ${isPublic}, userPermission: ${JSON.stringify(userPermission)}`
  );

  const hasAccess = isOwner || isPublic || userPermission;

  if (!hasAccess) {
    log.warn(`[Auth] FAILED: Access denied - no permission to view document`);
    return { authenticated: false, reason: 'Access denied - no permission to view document' };
  }

  const permissionLevel = userPermission?.level;
  const readOnly = permissionLevel === 'viewer';

  const userResult = await db.query('SELECT display_name FROM profiles WHERE id = $1', [userId]);

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

/**
 * Authenticate via Bearer token (JWT).
 * Used by native apps (Tauri) that send a token via HocuspocusProvider's token param.
 */
async function authenticateByToken(
  token: string,
  documentName: string
): Promise<AuthenticationResult> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'gruenerator-api',
      audience: 'gruenerator-app',
    });

    if (!payload.sub) {
      log.warn(`[Auth-Token] FAILED: Token missing sub claim`);
      return { authenticated: false, reason: 'Invalid token: missing user ID' };
    }

    const userId = payload.sub as string;
    log.info(`[Auth-Token] Token validated for user: ${userId}`);

    return checkDocumentPermissions(documentName, userId);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    log.warn(`[Auth-Token] JWT validation failed: ${err.message}`);
    return { authenticated: false, reason: 'Invalid or expired token' };
  }
}

/**
 * Authenticate via session cookie.
 * Used by web apps that send cookies via the WebSocket upgrade request.
 */
async function authenticateByCookie(
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

  if (!redisClient.isReady) {
    log.error(`[Auth-Cookie] FAILED: Redis client not ready`);
    return { authenticated: false, reason: 'Session store unavailable' };
  }

  const sessionString = await redisClient.get(sessionKey);

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
  return checkDocumentPermissions(documentName, userId);
}

/**
 * Authenticate WebSocket connection for Hocuspocus
 *
 * Supports two auth methods:
 * 1. Bearer token (JWT) — for native apps (Tauri) via data.token
 * 2. Session cookie — for web apps via requestHeaders.cookie
 *
 * Token auth is attempted first when present; cookie auth is the fallback.
 */
export async function authenticateConnection(
  data: AuthenticationData
): Promise<AuthenticationResult> {
  const { documentName, requestHeaders, token } = data;

  log.info(`[Auth] ========== Starting authentication ==========`);
  log.info(`[Auth] Document: ${documentName}, hasToken: ${!!token}`);

  try {
    // Try token-based auth first (native apps)
    if (token) {
      log.info(`[Auth] Using token-based authentication`);
      const result = await authenticateByToken(token, documentName);
      log.info(`[Auth] ========== Authentication complete ==========`);
      return result;
    }

    // Fall back to cookie-based auth (web apps)
    log.info(`[Auth] Using cookie-based authentication`);
    const result = await authenticateByCookie(requestHeaders, documentName);
    log.info(`[Auth] ========== Authentication complete ==========`);
    return result;
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

/**
 * Check if user can edit document (owner or editor permission)
 */
export async function canEditDocument(documentId: string, userId: string): Promise<boolean> {
  try {
    const result = await db.query(
      `SELECT created_by, permissions
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

    return (
      isOwner ||
      !!(
        userPermission &&
        userPermission.level !== undefined &&
        ['owner', 'editor'].includes(userPermission.level)
      )
    );
  } catch (error) {
    log.error(`[CanEdit] Error checking edit permission: ${error}`);
    return false;
  }
}

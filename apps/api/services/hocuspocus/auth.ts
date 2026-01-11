import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { parse as parseCookie } from 'cookie';
import redisClient from '../../utils/redis/client.js';

const log = createLogger('HocuspocusAuth');
const db = getPostgresInstance();

interface AuthenticationData {
  documentName: string;
  requestHeaders: Record<string, string | string[] | undefined>;
  requestParameters: URLSearchParams;
  connection: any;
}

interface AuthenticationResult {
  authenticated: boolean;
  userId?: string;
  userName?: string;
  readOnly?: boolean;
  reason?: string;
}

/**
 * Authenticate WebSocket connection for Hocuspocus
 *
 * Verifies:
 * 1. User has valid session (via cookie)
 * 2. User has permission to access the document
 */
export async function authenticateConnection(data: AuthenticationData): Promise<AuthenticationResult> {
  const { documentName, requestHeaders } = data;

  console.log(`[Auth] ========== Starting authentication ==========`);
  console.log(`[Auth] Document: ${documentName}`);
  log.info(`[Auth] ========== Starting authentication ==========`);
  log.info(`[Auth] Document: ${documentName}`);
  log.info(`[Auth] Headers present: ${JSON.stringify(Object.keys(requestHeaders))}`);

  try {
    // 1. Extract session from cookie
    const cookieHeader = requestHeaders.cookie;
    log.info(`[Auth] Cookie header exists: ${!!cookieHeader}`);
    log.info(`[Auth] Cookie header type: ${typeof cookieHeader}`);
    if (cookieHeader) {
      log.info(`[Auth] Cookie header value: ${cookieHeader}`);
    }

    if (!cookieHeader || typeof cookieHeader !== 'string') {
      log.warn(`[Auth] FAILED: No session cookie provided`);
      return {
        authenticated: false,
        reason: 'No session cookie provided',
      };
    }

    const cookies = parseCookie(cookieHeader);
    log.info(`[Auth] Parsed cookies: ${JSON.stringify(Object.keys(cookies))}`);

    const sessionCookie = cookies['gruenerator.sid'];
    log.info(`[Auth] gruenerator.sid cookie exists: ${!!sessionCookie}`);

    if (!sessionCookie) {
      log.warn(`[Auth] FAILED: No session cookie found in parsed cookies`);
      return {
        authenticated: false,
        reason: 'No session cookie found',
      };
    }

    // 2. Parse session ID from signed cookie
    // Format: s:SESSION_ID.SIGNATURE
    const sessionId = sessionCookie.startsWith('s:')
      ? sessionCookie.substring(2).split('.')[0]
      : sessionCookie;

    log.info(`[Auth] Extracted session ID: ${sessionId.substring(0, 8)}...`);

    if (!sessionId) {
      log.warn(`[Auth] FAILED: Invalid session cookie format`);
      return {
        authenticated: false,
        reason: 'Invalid session cookie format',
      };
    }

    // 3. Look up session in Redis
    // connect-redis stores sessions with key format: sess:{sessionId}
    const sessionKey = `sess:${sessionId}`;
    log.info(`[Auth] Looking up session in Redis: ${sessionKey}`);
    log.info(`[Auth] Redis client ready: ${redisClient.isReady}`);

    if (!redisClient.isReady) {
      log.error(`[Auth] FAILED: Redis client not ready`);
      return {
        authenticated: false,
        reason: 'Session store unavailable',
      };
    }

    const sessionString = await redisClient.get(sessionKey);
    log.info(`[Auth] Session found in Redis: ${!!sessionString}`);

    if (!sessionString) {
      log.warn(`[Auth] FAILED: Session not found or expired in Redis`);
      return {
        authenticated: false,
        reason: 'Session not found or expired',
      };
    }

    const sessionData = JSON.parse(typeof sessionString === 'string' ? sessionString : JSON.stringify(sessionString));
    log.info(`[Auth] Session data keys: ${JSON.stringify(Object.keys(sessionData))}`);

    const userId = sessionData?.passport?.user?.id || sessionData?.passport?.user;
    log.info(`[Auth] User ID from session: ${userId}`);

    if (!userId) {
      log.warn(`[Auth] FAILED: User not authenticated in session`);
      return {
        authenticated: false,
        reason: 'User not authenticated in session',
      };
    }

    // 4. Check document permissions
    log.info(`[Auth] Checking document permissions for: ${documentName}`);
    const docResult = await db.query(
      `SELECT created_by, permissions, is_public, is_deleted
       FROM collaborative_documents
       WHERE id = $1 AND document_subtype = 'docs'`,
      [documentName]
    );

    log.info(`[Auth] Document query returned ${docResult.length} results`);

    if (docResult.length === 0) {
      // Document doesn't exist yet - allow creation if user is authenticated
      log.info(`[Auth] Document ${documentName} doesn't exist, allowing authenticated user ${userId} to create it`);

      // Get user display name
      const userResult = await db.query(
        'SELECT display_name FROM profiles WHERE id = $1',
        [userId]
      );

      log.info(`[Auth] SUCCESS: User ${userId} authenticated for new document (read-write)`);
      return {
        authenticated: true,
        userId,
        userName: (userResult[0]?.display_name as string) || 'Unknown User',
        readOnly: false,
      };
    }

    const document = docResult[0];
    log.info(`[Auth] Document exists, checking permissions...`);
    log.info(`[Auth] Document owner: ${document.created_by}`);
    log.info(`[Auth] Document is_public: ${document.is_public}`);
    log.info(`[Auth] Document is_deleted: ${document.is_deleted}`);

    if (document.is_deleted) {
      log.warn(`[Auth] FAILED: Document has been deleted`);
      return {
        authenticated: false,
        reason: 'Document has been deleted',
      };
    }

    // Check if user has access
    const isOwner = document.created_by === userId;
    const isPublic = document.is_public;
    const permissions = document.permissions || {};
    const userPermission = permissions[userId];

    log.info(`[Auth] isOwner: ${isOwner}`);
    log.info(`[Auth] isPublic: ${isPublic}`);
    log.info(`[Auth] userPermission: ${JSON.stringify(userPermission)}`);

    const hasAccess = isOwner || isPublic || userPermission;

    if (!hasAccess) {
      log.warn(`[Auth] FAILED: Access denied - no permission to view document`);
      return {
        authenticated: false,
        reason: 'Access denied - no permission to view document',
      };
    }

    // Determine if read-only
    const permissionLevel = userPermission?.level;
    const readOnly = permissionLevel === 'viewer';

    // Get user display name
    const userResult = await db.query(
      'SELECT display_name FROM profiles WHERE id = $1',
      [userId]
    );

    log.info(
      `[Auth] SUCCESS: User ${userId} authenticated for document ${documentName} (${readOnly ? 'read-only' : 'read-write'})`
    );
    log.info(`[Auth] ========== Authentication complete ==========`);

    return {
      authenticated: true,
      userId,
      userName: (userResult[0]?.display_name as string) || 'Unknown User',
      readOnly,
    };

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
    const permissions = document.permissions || {};
    const userPermission = permissions[userId];

    return isOwner || (userPermission && ['owner', 'editor'].includes(userPermission.level));
  } catch (error) {
    log.error(`[CanEdit] Error checking edit permission: ${error}`);
    return false;
  }
}

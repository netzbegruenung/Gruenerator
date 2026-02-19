/**
 * Redis operations
 * Handles document storage and retrieval in Redis
 */

import crypto from 'crypto';

import type { Attachment, StoredDocument, ClearUserDataResult } from './types.js';

/**
 * Retrieve documents from Redis by IDs
 */
export async function getDocumentsFromRedis(
  redis: any,
  documentIds: string[],
  userId: string
): Promise<StoredDocument[]> {
  const documents: StoredDocument[] = [];

  for (const docId of documentIds) {
    try {
      // Security check: ensure document belongs to user
      if (!docId.includes(userId)) {
        console.warn(`[DocumentQnAService] Access denied to document ${docId} for user ${userId}`);
        continue;
      }

      const docData = await redis.get(docId);
      if (docData) {
        const document = JSON.parse(docData);
        documents.push(document);
      } else {
        console.warn(`[DocumentQnAService] Document ${docId} not found in Redis`);
      }
    } catch (error) {
      console.error(`[DocumentQnAService] Error retrieving document ${docId}:`, error);
    }
  }

  return documents;
}

/**
 * Store raw attachment in Redis with 24-hour TTL
 */
export async function storeAttachment(
  redis: any,
  userId: string,
  attachment: Attachment
): Promise<string> {
  const timestamp = Date.now();
  const randomId = crypto.randomBytes(4).toString('hex');
  const docId = `doc:${userId}:${timestamp}:${randomId}`;

  const documentData: StoredDocument = {
    name: attachment.name,
    type: attachment.type,
    data: attachment.data, // base64
    size: attachment.size,
    uploadedAt: timestamp,
    userId: userId,
  };

  // Store for 24 hours
  await redis.setEx(docId, 86400, JSON.stringify(documentData));

  console.log(`[DocumentQnAService] Stored attachment ${attachment.name} as ${docId}`);
  return docId;
}

/**
 * Store multiple attachments and update user's recent documents list
 */
export async function storeAttachments(
  redis: any,
  userId: string,
  attachments: Attachment[]
): Promise<string[]> {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  const documentIds: string[] = [];

  for (const attachment of attachments) {
    try {
      const docId = await storeAttachment(redis, userId, attachment);
      documentIds.push(docId);
    } catch (error: any) {
      console.error(`[DocumentQnAService] Error storing attachment ${attachment.name}:`, error);
    }
  }

  // Update user's recent documents list (keep last 10)
  if (documentIds.length > 0) {
    await redis.lPush(`user:${userId}:recent_docs`, ...documentIds);
    await redis.lTrim(`user:${userId}:recent_docs`, 0, 9);
  }

  console.log(`[DocumentQnAService] Stored ${documentIds.length} attachments for user ${userId}`);
  return documentIds;
}

/**
 * Get user's recent document IDs for conversation memory
 */
export async function getRecentDocuments(
  redis: any,
  userId: string,
  limit: number = 5
): Promise<string[]> {
  try {
    const recentDocIds = await redis.lRange(`user:${userId}:recent_docs`, 0, limit - 1);
    return recentDocIds;
  } catch (error) {
    console.error(`[DocumentQnAService] Error getting recent documents:`, error);
    return [];
  }
}

/**
 * Clear all user documents and caches from Redis
 */
export async function clearUserDocuments(redis: any, userId: string): Promise<ClearUserDataResult> {
  if (!userId) {
    return {
      success: false,
      deletedDocuments: 0,
      deletedCacheEntries: 0,
    };
  }

  try {
    let deletedCount = 0;

    // Get recent document IDs for this user
    const recentDocIds = await redis.lRange(`user:${userId}:recent_docs`, 0, -1);

    // Delete all user documents
    for (const docId of recentDocIds) {
      try {
        const result = await redis.del(docId);
        if (result > 0) deletedCount++;
      } catch (error) {
        console.warn(`[DocumentQnAService] Error deleting document ${docId}:`, error);
      }
    }

    // Clear recent documents list
    await redis.del(`user:${userId}:recent_docs`);

    // Clear all QnA caches for this user (pattern-based deletion)
    const cachePattern = `qna:*`;
    const cacheKeys = await redis.keys(cachePattern);

    // Check each cache key to see if it's related to this user's documents
    for (const cacheKey of cacheKeys) {
      try {
        // Since cache keys contain hashed document IDs, we can't easily match by userId
        // For now, we'll delete all QnA caches as they expire in 1 hour anyway
        // In production, you might want a more sophisticated approach
        await redis.del(cacheKey);
      } catch (error) {
        console.warn(`[DocumentQnAService] Error deleting cache ${cacheKey}:`, error);
      }
    }

    console.log(
      `[DocumentQnAService] Cleared user data for ${userId}: ${deletedCount} documents, ${cacheKeys.length} cache entries`
    );
    return {
      success: true,
      deletedDocuments: deletedCount,
      deletedCacheEntries: cacheKeys.length,
    };
  } catch (error) {
    console.error(`[DocumentQnAService] Error clearing user documents:`, error);
    return {
      success: false,
      deletedDocuments: 0,
      deletedCacheEntries: 0,
    };
  }
}

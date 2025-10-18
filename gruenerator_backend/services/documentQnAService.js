/**
 * DocumentQnAService - Context-aware document knowledge extraction
 * Stores raw documents in Redis and extracts relevant information on-demand using Mistral
 */

const crypto = require('crypto');

class DocumentQnAService {
  constructor(redisClient, mistralClient) {
    this.redis = redisClient;
    this.mistral = mistralClient;
  }

  /**
   * Extract context-specific knowledge from documents for a given intent
   * @param {Array} documentIds - Array of document IDs in Redis
   * @param {Object} intent - Intent object with agent type
   * @param {string} message - User's original message
   * @param {string} userId - User ID for caching
   * @returns {string|null} Extracted knowledge or null if no documents
   */
  async extractKnowledgeForIntent(documentIds, intent, message, userId) {
    if (!documentIds || documentIds.length === 0) {
      return null;
    }

    console.log(`[DocumentQnAService] Extracting knowledge for intent: ${intent.agent}, documents: ${documentIds.length}`);

    // Check cache first
    const cacheKey = this.generateCacheKey(documentIds, intent.agent, message);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      console.log(`[DocumentQnAService] Using cached knowledge for ${intent.agent}`);
      return JSON.parse(cached);
    }

    // Get documents from Redis
    const documents = await this.getDocumentsFromRedis(documentIds, userId);
    if (documents.length === 0) {
      console.log(`[DocumentQnAService] No accessible documents found`);
      return null;
    }

    try {
      // Generate context-specific questions
      const questions = this.generateQuestionsForIntent(intent, message);

      // Ask Mistral to extract relevant knowledge
      const knowledge = await this.askMistralAboutDocuments(documents, questions);

      // Cache the result for 1 hour
      await this.redis.setEx(cacheKey, 3600, JSON.stringify(knowledge));

      console.log(`[DocumentQnAService] Extracted knowledge for ${intent.agent}: ${knowledge.length} chars`);
      return knowledge;

    } catch (error) {
      console.error(`[DocumentQnAService] Error extracting knowledge:`, error);
      return null;
    }
  }

  /**
   * Retrieve documents from Redis by IDs
   * @param {Array} documentIds - Document IDs to retrieve
   * @param {string} userId - User ID for security check
   * @returns {Array} Array of document objects
   */
  async getDocumentsFromRedis(documentIds, userId) {
    const documents = [];

    for (const docId of documentIds) {
      try {
        // Security check: ensure document belongs to user
        if (!docId.includes(userId)) {
          console.warn(`[DocumentQnAService] Access denied to document ${docId} for user ${userId}`);
          continue;
        }

        const docData = await this.redis.get(docId);
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
   * Generate context-specific questions based on intent and user message
   * @param {Object} intent - Intent object with agent type
   * @param {string} message - User's message for context
   * @returns {string} Question for Mistral
   */
  generateQuestionsForIntent(intent, message) {
    const agent = intent.agent;
    const context = message.substring(0, 200); // First 200 chars for context

    switch (agent) {
      case 'social_media':
        return `Extrahiere die wichtigsten Punkte aus den Dokumenten für einen Social Media Post über: "${context}".
                Fokussiere auf: Emotionale Aussagen, prägnante Zahlen, interessante Fakten, eingängige Zitate.
                Antworte in 5-8 kurzen Stichpunkten.`;

      case 'pressemitteilung':
        return `Welche Informationen aus den Dokumenten sind relevant für eine Pressemitteilung über: "${context}"?
                Fokussiere auf: Offizielle Aussagen, verifizierbare Daten, Expertenaussagen, Hintergrundinformationen.
                Antworte in 6-10 präzisen Stichpunkten.`;

      case 'antrag':
        return `Welche Argumente und Fakten aus den Dokumenten unterstützen einen politischen Antrag zu: "${context}"?
                Fokussiere auf: Rechtliche Grundlagen, Präzedenzfälle, Sachargumente, Begründungen.
                Antworte in 6-10 strukturierten Stichpunkten.`;

      case 'zitat':
        return `Finde prägnante Zitate und Aussagen aus den Dokumenten, die sich auf das Thema beziehen: "${context}".
                Fokussiere auf: Markante Aussagen, emotionale Zitate, pointierte Meinungen.
                Antworte mit 3-5 direkten Zitaten mit Kontext.`;

      case 'leichte_sprache':
        return `Identifiziere die Hauptaussagen aus den Dokumenten zu: "${context}".
                Diese sollen in leichte Sprache übersetzt werden. Fokussiere auf: Kernbotschaften, wichtige Fakten.
                Antworte in 4-6 einfachen Stichpunkten.`;

      case 'gruene_jugend':
        return `Welche Aspekte aus den Dokumenten sind relevant für junge Menschen und Aktivismus zu: "${context}"?
                Fokussiere auf: Zukunftsbezug, Generationengerechtigkeit, Handlungsaufforderungen.
                Antworte in 5-7 aktivistischen Stichpunkten.`;

      case 'universal':
      default:
        return `Was sagen die Dokumente zu: "${context}"?
                Extrahiere die relevantesten Informationen und Fakten.
                Antworte in 6-8 strukturierten Stichpunkten.`;
    }
  }

  /**
   * Ask Mistral to extract knowledge from documents using context-specific questions
   * @param {Array} documents - Array of document objects
   * @param {string} questions - Questions to ask about the documents
   * @returns {string} Extracted knowledge
   */
  async askMistralAboutDocuments(documents, questions) {
    const content = [];

    // Add the question
    content.push({
      type: 'text',
      text: questions
    });

    // Add documents
    for (const doc of documents) {
      if (doc.type === 'application/pdf' || doc.type.startsWith('image/')) {
        // Use Mistral's document understanding for PDFs and images
        content.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: doc.type,
            data: doc.data
          }
        });
      } else if (doc.type.startsWith('text/')) {
        // For text files, decode base64 and add as text
        const textContent = Buffer.from(doc.data, 'base64').toString('utf-8');
        content.push({
          type: 'text',
          text: `[Inhalt von ${doc.name}]\n\n${textContent}`
        });
      }
    }

    console.log(`[DocumentQnAService] Asking Mistral about ${documents.length} documents`);

    // Convert content array to string for Mistral API
    const messageContent = content.map(item => {
      if (item.type === 'text') {
        return item.text;
      } else if (item.type === 'document') {
        return `[Dokument: ${item.source?.media_type || 'unbekannt'}]`;
      }
      return '';
    }).join('\n\n');

    const response = await this.mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: messageContent }],
      max_tokens: 800,
      temperature: 0.2,
      top_p: 0.85
    });

    const knowledge = response.choices?.[0]?.message?.content || '';

    if (!knowledge.trim()) {
      throw new Error('No knowledge extracted from documents');
    }

    return knowledge.trim();
  }

  /**
   * Generate cache key for document extraction
   * @param {Array} documentIds - Document IDs
   * @param {string} agent - Intent agent type
   * @param {string} message - User message
   * @returns {string} Cache key
   */
  generateCacheKey(documentIds, agent, message) {
    const sortedIds = [...documentIds].sort();
    const messageHash = crypto.createHash('md5').update(message.substring(0, 100)).digest('hex');
    const idsHash = crypto.createHash('md5').update(sortedIds.join(':')).digest('hex');

    return `qna:${agent}:${idsHash}:${messageHash}`;
  }

  /**
   * Store raw attachment in Redis with 24-hour TTL
   * @param {string} userId - User ID
   * @param {Object} attachment - Attachment object from frontend
   * @returns {string} Document ID
   */
  async storeAttachment(userId, attachment) {
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(4).toString('hex');
    const docId = `doc:${userId}:${timestamp}:${randomId}`;

    const documentData = {
      name: attachment.name,
      type: attachment.type,
      data: attachment.data, // base64
      size: attachment.size,
      uploadedAt: timestamp,
      userId: userId
    };

    // Store for 24 hours
    await this.redis.setEx(docId, 86400, JSON.stringify(documentData));

    console.log(`[DocumentQnAService] Stored attachment ${attachment.name} as ${docId}`);
    return docId;
  }

  /**
   * Store multiple attachments and update user's recent documents list
   * @param {string} userId - User ID
   * @param {Array} attachments - Array of attachment objects
   * @returns {Array} Array of document IDs
   */
  async storeAttachments(userId, attachments) {
    if (!attachments || attachments.length === 0) {
      return [];
    }

    const documentIds = [];

    for (const attachment of attachments) {
      try {
        const docId = await this.storeAttachment(userId, attachment);
        documentIds.push(docId);
      } catch (error) {
        console.error(`[DocumentQnAService] Error storing attachment ${attachment.name}:`, error);
      }
    }

    // Update user's recent documents list (keep last 10)
    if (documentIds.length > 0) {
      await this.redis.lPush(`user:${userId}:recent_docs`, ...documentIds);
      await this.redis.lTrim(`user:${userId}:recent_docs`, 0, 9);
    }

    console.log(`[DocumentQnAService] Stored ${documentIds.length} attachments for user ${userId}`);
    return documentIds;
  }

  /**
   * Get user's recent document IDs for conversation memory
   * @param {string} userId - User ID
   * @param {number} limit - Maximum number of documents to return
   * @returns {Array} Array of recent document IDs
   */
  async getRecentDocuments(userId, limit = 5) {
    try {
      const recentDocIds = await this.redis.lRange(`user:${userId}:recent_docs`, 0, limit - 1);
      return recentDocIds;
    } catch (error) {
      console.error(`[DocumentQnAService] Error getting recent documents:`, error);
      return [];
    }
  }

  /**
   * Clear all user documents and caches from Redis
   * @param {string} userId - User ID
   * @returns {boolean} Success status
   */
  async clearUserDocuments(userId) {
    if (!userId) {
      return false;
    }

    try {
      let deletedCount = 0;

      // Get recent document IDs for this user
      const recentDocIds = await this.redis.lRange(`user:${userId}:recent_docs`, 0, -1);

      // Delete all user documents
      for (const docId of recentDocIds) {
        try {
          const result = await this.redis.del(docId);
          if (result > 0) deletedCount++;
        } catch (error) {
          console.warn(`[DocumentQnAService] Error deleting document ${docId}:`, error);
        }
      }

      // Clear recent documents list
      await this.redis.del(`user:${userId}:recent_docs`);

      // Clear all QnA caches for this user (pattern-based deletion)
      const cachePattern = `qna:*`;
      const cacheKeys = await this.redis.keys(cachePattern);

      // Check each cache key to see if it's related to this user's documents
      for (const cacheKey of cacheKeys) {
        try {
          // Since cache keys contain hashed document IDs, we can't easily match by userId
          // For now, we'll delete all QnA caches as they expire in 1 hour anyway
          // In production, you might want a more sophisticated approach
          await this.redis.del(cacheKey);
        } catch (error) {
          console.warn(`[DocumentQnAService] Error deleting cache ${cacheKey}:`, error);
        }
      }

      console.log(`[DocumentQnAService] Cleared user data for ${userId}: ${deletedCount} documents, ${cacheKeys.length} cache entries`);
      return true;

    } catch (error) {
      console.error(`[DocumentQnAService] Error clearing user documents:`, error);
      return false;
    }
  }
}

module.exports = DocumentQnAService;
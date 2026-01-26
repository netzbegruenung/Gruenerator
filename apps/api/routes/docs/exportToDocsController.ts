import { Router, Response } from 'express';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { AuthenticatedRequest } from '../../middleware/types.js';
import {
  validateAndSanitizeHtml,
  extractTitleFromHtml,
} from '../../services/tiptap/contentConverter.js';

const router = Router();
const db = getPostgresInstance();

interface ExportToDocsRequest {
  content: string;
  title?: string;
  documentType?: string;
}

interface ExportToDocsResponse {
  documentId: string;
  url: string;
  success: boolean;
}

/**
 * @route   POST /api/docs/from-export
 * @desc    Create a collaborative document from exported content (HTML/Markdown)
 * @access  Private (requires authentication)
 */
router.post('/from-export', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content, title, documentType }: ExportToDocsRequest = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Validate content
    if (!content) {
      return res.status(400).json({ error: 'Content is required' });
    }

    let sanitizedContent: string;
    try {
      sanitizedContent = validateAndSanitizeHtml(content);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }

    // Generate title
    const documentTitle = title || extractTitleFromHtml(sanitizedContent);

    // Add timestamp if title doesn't already have one
    const finalTitle = title || `${documentTitle} - ${new Date().toLocaleDateString('de-DE')}`;

    // Create document in database
    const result = await db.query(
      `INSERT INTO collaborative_documents
        (title, content, created_by, last_edited_by, document_subtype, is_public, permissions)
       VALUES ($1, $2, $3, $3, 'docs', false, $4)
       RETURNING *`,
      [
        finalTitle,
        sanitizedContent,
        userId,
        JSON.stringify({
          [userId]: {
            level: 'owner',
            granted_at: new Date().toISOString(),
          },
        }),
      ]
    );

    const document = result[0];

    // Log the export for analytics
    console.log(
      `[Docs Export] User ${userId} created document ${document.id} from export (type: ${documentType || 'unknown'})`
    );

    // Return response
    const response: ExportToDocsResponse = {
      documentId: document.id as string,
      url: `/document/${document.id}`,
      success: true,
    };

    return res.status(201).json(response);
  } catch (error: any) {
    console.error('[Docs Export] Error creating document:', error);

    // Determine appropriate error response
    if (error.message?.includes('too large')) {
      return res.status(413).json({
        error: 'Content too large',
        message: 'The content exceeds the maximum size limit of 1MB',
      });
    }

    return res.status(500).json({
      error: 'Failed to create document',
      message: 'An error occurred while creating the document. Please try again.',
    });
  }
});

export default router;

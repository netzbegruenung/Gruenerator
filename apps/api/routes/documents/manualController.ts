/**
 * Manual Controller - Manual document uploads and text additions
 *
 * Handles:
 * - POST /upload-manual - Manual file upload (vectors-only)
 * - POST /upload-only - Fast file upload (disk only, no processing)
 * - GET /:id/status - Document processing status
 * - POST /add-text - Add text content manually
 * - POST /crawl-url-manual - Manual URL crawling
 * - POST /upload-default - Default upload (redirects to manual)
 * - POST /crawl-url-default - Default crawl (redirects to manual)
 */

import express, { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { getDocumentProcessingService } from '../../services/document-services/DocumentProcessingService/index.js';
import { getPostgresDocumentService } from '../../services/document-services/PostgresDocumentService/index.js';
import { createLogger } from '../../utils/logger.js';
import type {
  DocumentRequest,
  UploadManualRequestBody,
  AddTextRequestBody,
  CrawlUrlRequestBody,
} from './types.js';

const log = createLogger('documents:manual');
const router: Router = express.Router();

// Initialize services
const documentProcessingService = getDocumentProcessingService();
const postgresDocumentService = getPostgresDocumentService();

// Configure multer for file uploads (memory storage, no disk persistence)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for text processing in memory
  },
});

// Pending uploads directory
const PENDING_UPLOADS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '../../uploads/pending'
);

// Configure multer with disk storage for upload-only endpoint
const uploadDisk = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const userId = (req as any).user?.id || 'anonymous';
      const dir = path.join(PENDING_UPLOADS_DIR, userId);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const uniqueName = `${randomUUID()}-${file.originalname}`;
      cb(null, uniqueName);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

/**
 * POST /upload-only - Fast file upload to disk, no OCR/vectorization.
 * Creates a document record with status 'uploaded'. Processing is deferred.
 */
router.post(
  '/upload-only',
  uploadDisk.single('document'),
  async (req: DocumentRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }

      const title = (req.body as UploadManualRequestBody).title || file.originalname;

      const documentMetadata = await postgresDocumentService.saveDocumentMetadata(userId, {
        title: title.trim(),
        filename: file.originalname,
        sourceType: 'manual',
        vectorCount: 0,
        fileSize: file.size,
        status: 'uploaded',
        additionalMetadata: {
          filePath: file.path,
          mimetype: file.mimetype,
        },
      });

      log.debug(`[POST /upload-only] File saved to disk: ${file.path}, doc ID: ${documentMetadata.id}`);

      res.json({
        success: true,
        message: 'File uploaded successfully',
        data: {
          id: documentMetadata.id,
          title: documentMetadata.title,
          filename: file.originalname,
          status: 'uploaded',
        },
      });
    } catch (error) {
      log.error('[POST /upload-only] Error:', error);
      // Clean up uploaded file on error
      if (req.file?.path) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // Ignore cleanup error
        }
      }
      res.status(500).json({
        success: false,
        message: (error as Error).message || 'Failed to upload file',
      });
    }
  }
);

/**
 * GET /:id/status - Get document processing status
 */
router.get('/:id/status', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const document = await postgresDocumentService.getDocumentById(req.params.id, userId);
    if (!document) {
      res.status(404).json({ success: false, message: 'Document not found' });
      return;
    }

    res.json({
      success: true,
      data: {
        id: document.id,
        status: document.status,
        title: document.title,
        vectorCount: document.vector_count || 0,
      },
    });
  } catch (error) {
    log.error('[GET /:id/status] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to get document status',
    });
  }
});

/**
 * POST /upload-manual - Manual file upload (no file storage, vectors only)
 */
router.post(
  '/upload-manual',
  upload.single('document'),
  async (req: DocumentRequest, res: Response): Promise<void> => {
    try {
      const { title } = req.body as UploadManualRequestBody;
      const file = req.file;
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate file upload
      if (!file) {
        res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
        return;
      }

      // Validate title
      if (!title) {
        res.status(400).json({
          success: false,
          message: 'Title is required',
        });
        return;
      }

      // Use document processing service
      const result = await documentProcessingService.processFileUpload(
        userId,
        file,
        title,
        'manual'
      );

      res.json({
        success: true,
        message: 'Document processed and vectorized successfully',
        data: result,
      });
    } catch (error) {
      log.error('[POST /upload-manual] Error:', error);
      res.status(500).json({
        success: false,
        message: (error as Error).message || 'Failed to process manual upload',
      });
    }
  }
);

/**
 * POST /add-text - Add text content manually (no file upload)
 */
router.post('/add-text', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const { title, content } = req.body as AddTextRequestBody;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate content
    if (!content || content.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Text content is required',
      });
      return;
    }

    // Validate title
    if (!title || title.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: 'Title is required',
      });
      return;
    }

    // Use document processing service
    const result = await documentProcessingService.processTextContent(
      userId,
      title,
      content,
      'manual'
    );

    res.json({
      success: true,
      message: 'Text processed and vectorized successfully',
      data: result,
    });
  } catch (error) {
    log.error('[POST /add-text] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'Failed to process text',
    });
  }
});

/**
 * POST /crawl-url-manual - Manual URL crawling (vectors-only)
 */
router.post('/crawl-url-manual', async (req: DocumentRequest, res: Response): Promise<void> => {
  try {
    const { url, title } = req.body as CrawlUrlRequestBody;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate URL
    if (!url || !url.trim()) {
      res.status(400).json({
        success: false,
        message: 'URL is required',
      });
      return;
    }

    // Validate title
    if (!title || !title.trim()) {
      res.status(400).json({
        success: false,
        message: 'Title is required',
      });
      return;
    }

    log.debug(`[POST /crawl-url-manual] Starting crawl for URL: ${url} with title: ${title}`);

    // Import URL crawler dynamically
    const { urlCrawlerService } =
      await import('../../services/scrapers/implementations/UrlCrawler/index.js');

    // Crawl the URL
    const crawlResult = await urlCrawlerService.crawlUrl(url.trim());
    if (!crawlResult.success || !crawlResult.data?.content) {
      throw new Error(crawlResult.error || 'Failed to crawl URL');
    }

    // Use document processing service
    const result = await documentProcessingService.processUrlContent(
      userId,
      url,
      title,
      crawlResult.data.content,
      'url'
    );

    res.json({
      success: true,
      message: 'URL crawled and vectorized successfully',
      data: result,
    });
  } catch (error) {
    log.error('[POST /crawl-url-manual] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message,
    });
  }
});

/**
 * POST /upload-default - Default upload endpoint
 * Currently defaults to manual mode for all users
 * NOTE: This could be extended to check user preferences in the future
 */
router.post(
  '/upload-default',
  upload.single('document'),
  async (req: DocumentRequest, res: Response): Promise<void> => {
    log.debug('[POST /upload-default] Processing upload in manual mode (default behavior)');

    try {
      const { title } = req.body as UploadManualRequestBody;
      const file = req.file;
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Validate file upload
      if (!file) {
        res.status(400).json({
          success: false,
          message: 'No file uploaded',
        });
        return;
      }

      // Validate title
      if (!title) {
        res.status(400).json({
          success: false,
          message: 'Title is required',
        });
        return;
      }

      // Use document processing service (default to manual mode)
      const result = await documentProcessingService.processFileUpload(
        userId,
        file,
        title,
        'manual'
      );

      res.json({
        success: true,
        message: 'Document processed and vectorized successfully',
        data: result,
      });
    } catch (error) {
      log.error('[POST /upload-default] Error:', error);
      res.status(500).json({
        success: false,
        message: (error as Error).message || 'Failed to process upload',
      });
    }
  }
);

/**
 * POST /crawl-url-default - Default URL crawling endpoint
 * Currently defaults to manual mode for all users
 */
router.post('/crawl-url-default', async (req: DocumentRequest, res: Response): Promise<void> => {
  log.debug('[POST /crawl-url-default] Processing URL crawl in manual mode (default behavior)');

  try {
    const { url, title } = req.body as CrawlUrlRequestBody;
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Validate URL
    if (!url || !url.trim()) {
      res.status(400).json({
        success: false,
        message: 'URL is required',
      });
      return;
    }

    // Validate title
    if (!title || !title.trim()) {
      res.status(400).json({
        success: false,
        message: 'Title is required',
      });
      return;
    }

    log.debug(`[POST /crawl-url-default] Starting crawl for URL: ${url}`);

    // Import URL crawler dynamically
    const { urlCrawlerService } =
      await import('../../services/scrapers/implementations/UrlCrawler/index.js');

    // Crawl the URL
    const crawlResult = await urlCrawlerService.crawlUrl(url.trim());
    if (!crawlResult.success || !crawlResult.data?.content) {
      throw new Error(crawlResult.error || 'Failed to crawl URL');
    }

    // Use document processing service (default to manual mode)
    const result = await documentProcessingService.processUrlContent(
      userId,
      url,
      title,
      crawlResult.data.content,
      'url'
    );

    res.json({
      success: true,
      message: 'URL crawled and vectorized successfully',
      data: result,
    });
  } catch (error) {
    log.error('[POST /crawl-url-default] Error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message,
    });
  }
});

export default router;

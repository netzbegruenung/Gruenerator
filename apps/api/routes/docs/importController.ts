import { Router, type Response } from 'express';
import multer from 'multer';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { type AuthenticatedRequest } from '../../middleware/types.js';
import NextcloudApiClient from '../../services/api-clients/nextcloudApiClient.js';
import { markdownToHtml } from '../../services/markdown/index.js';
import { ocrService } from '../../services/OcrService/index.js';
import { getWolkeSyncService } from '../../services/sync/index.js';
import { extractTitleFromHtml } from '../../services/tiptap/contentConverter.js';

const router = Router();
const db = getPostgresInstance();

const MAX_IMPORT_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.odt': 'application/vnd.oasis.opendocument.text',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function titleFromFilename(filename: string): string {
  return (
    filename
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim() || 'Importiertes Dokument'
  );
}

async function ocrBufferToDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  userId: string,
  source: string
): Promise<{ documentId: string; url: string }> {
  const base64Data = buffer.toString('base64');
  const extractionResult = await ocrService.extractTextFromBase64(base64Data, filename, mimeType);

  if (!extractionResult.text?.trim()) {
    throw new OcrImportError(
      'Kein Text erkannt. Die Datei ist möglicherweise leer oder nicht lesbar.',
      422
    );
  }

  console.log(
    `[DocsImport] OCR complete (${source}): ${extractionResult.text.length} chars, method=${extractionResult.method}`
  );

  const html = markdownToHtml(extractionResult.text);

  if (!html?.trim()) {
    throw new OcrImportError('Konvertierung fehlgeschlagen', 422);
  }

  const htmlSizeBytes = new Blob([html]).size;
  if (htmlSizeBytes > MAX_IMPORT_SIZE) {
    throw new OcrImportError(
      `Dokument zu groß: ${(htmlSizeBytes / 1024 / 1024).toFixed(1)}MB (max ${MAX_IMPORT_SIZE / 1024 / 1024}MB)`,
      413
    );
  }

  const title =
    extractTitleFromHtml(html) !== 'Untitled Document'
      ? extractTitleFromHtml(html)
      : titleFromFilename(filename);

  const result = await db.query(
    `INSERT INTO collaborative_documents
      (title, content, created_by, last_edited_by, document_subtype, is_public, permissions)
     VALUES ($1, $2, $3, $3, 'blank', false, $4)
     RETURNING *`,
    [
      title,
      html,
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

  console.log(`[DocsImport] Created document ${document.id} from ${filename} (${source})`);

  return { documentId: document.id as string, url: `/docs/${document.id}` };
}

class OcrImportError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * @route   POST /api/docs/from-import
 * @desc    Import a PDF/DOCX/ODT/PPTX file as a styled collaborative document via OCR
 * @access  Private (requires authentication)
 */
router.post(
  '/from-import',
  requireAuth,
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return res.status(400).json({
          error: 'Nicht unterstütztes Dateiformat. Erlaubt: PDF, DOCX, DOC, ODT, PPTX',
        });
      }

      console.log(
        `[DocsImport] User ${userId} importing file: ${file.originalname} (${file.mimetype}, ${(file.size / 1024).toFixed(0)}KB)`
      );

      const result = await ocrBufferToDocument(
        file.buffer,
        file.originalname,
        file.mimetype,
        userId,
        'file-upload'
      );

      return res.status(201).json({ ...result, success: true });
    } catch (error: any) {
      console.error('[DocsImport] Error importing file:', error);

      if (error instanceof OcrImportError) {
        return res.status(error.status).json({ error: error.message });
      }

      return res.status(500).json({
        error: 'Import fehlgeschlagen. Bitte versuche es erneut.',
      });
    }
  }
);

interface WolkeImportBody {
  shareLinkId: string;
  filePath: string;
  fileName: string;
}

/**
 * @route   POST /api/docs/from-wolke
 * @desc    Import a file from Nextcloud/Wolke as a styled collaborative document via OCR
 * @access  Private (requires authentication)
 */
router.post('/from-wolke', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { shareLinkId, filePath, fileName } = req.body as WolkeImportBody;

    if (!shareLinkId || !filePath || !fileName) {
      return res
        .status(400)
        .json({ error: 'shareLinkId, filePath und fileName sind erforderlich' });
    }

    const ext = '.' + fileName.split('.').pop()?.toLowerCase() || '';
    const mimeType = MIME_BY_EXTENSION[ext];
    if (!mimeType) {
      return res.status(400).json({
        error: 'Nicht unterstütztes Dateiformat. Erlaubt: PDF, DOCX, DOC, ODT, PPTX',
      });
    }

    console.log(
      `[DocsImport:Wolke] User ${userId} importing from Wolke: ${fileName} (share=${shareLinkId})`
    );

    const wolkeSyncService = getWolkeSyncService();
    const shareLink = await wolkeSyncService.getShareLink(userId, shareLinkId);

    if (!shareLink?.share_link) {
      return res.status(404).json({ error: 'Wolke-Verbindung nicht gefunden' });
    }

    const client = new NextcloudApiClient(shareLink.share_link);
    const downloaded = await client.downloadFile(filePath);

    if (!downloaded.buffer || downloaded.buffer.length === 0) {
      return res
        .status(422)
        .json({ error: 'Datei konnte nicht von der Wolke heruntergeladen werden' });
    }

    console.log(
      `[DocsImport:Wolke] Downloaded ${fileName}: ${(downloaded.size / 1024).toFixed(0)}KB`
    );

    const result = await ocrBufferToDocument(
      downloaded.buffer,
      fileName,
      mimeType,
      userId,
      'wolke'
    );

    return res.status(201).json({ ...result, success: true });
  } catch (error: any) {
    console.error('[DocsImport:Wolke] Error:', error);

    if (error instanceof OcrImportError) {
      return res.status(error.status).json({ error: error.message });
    }

    return res.status(500).json({
      error: 'Import aus Wolke fehlgeschlagen. Bitte versuche es erneut.',
    });
  }
});

export default router;

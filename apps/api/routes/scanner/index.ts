/**
 * Scanner API Route
 * Provides OCR text extraction from uploaded documents (PDF, images, DOCX)
 * using Mistral OCR via the existing OcrService
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import {
  ocrProviderSchema,
  scannerExtractQuerySchema,
  type ScannerExtractResponse,
} from '@gruenerator/contracts';
import { Router, type Response, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';

import authMiddleware from '../../middleware/authMiddleware.js';
import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { ocrService } from '../../services/OcrService/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('scanner');
const router: Router = Router();

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.docx', '.pptx'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_PAGES = 20;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Ungültiger Dateityp. Erlaubt sind: ${ALLOWED_EXTENSIONS.join(', ')}`));
    }
  },
});

// Provider may also arrive as a body field (multipart form). The query is the
// primary channel (see frontend), but accept either and validate against the
// shared enum so an unknown value is a 400, not a silent fallthrough.
const scannerBodySchema = z.object({
  provider: ocrProviderSchema.optional(),
});

router.post(
  '/extract',
  authMiddleware.requireAuth,
  upload.single('file'),
  validateBody(scannerBodySchema) as RequestHandler,
  async (
    req: TypedRequest<z.infer<typeof scannerBodySchema>>,
    res: Response<ScannerExtractResponse>
  ): Promise<void> => {
    const startTime = Date.now();
    let tempFilePath: string | null = null;

    try {
      if (!req.file) {
        log.warn('No file in request');
        res.status(400).json({
          success: false,
          error: 'Keine Datei hochgeladen',
        });
        return;
      }

      const { originalname, buffer, mimetype, size } = req.file;
      const ext = path.extname(originalname).toLowerCase();

      log.info(`Processing file: ${originalname} (${mimetype}, ${size} bytes)`);

      // Write buffer to temp file (OcrService expects file path)
      const tempDir = os.tmpdir();
      const tempFileName = `scanner_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
      tempFilePath = path.join(tempDir, tempFileName);

      await fs.writeFile(tempFilePath, buffer);
      log.debug(`Temp file created: ${tempFilePath}`);

      // Extract text using OcrService (optional per-request provider override).
      // Validate the query provider against the shared enum; reject unknowns so
      // a typo can't silently route to the env-default provider.
      const queryProvider = scannerExtractQuerySchema.safeParse(req.query);
      if (!queryProvider.success) {
        res.status(400).json({
          success: false,
          error: `Ungültiger OCR-Provider. Erlaubt: ${ocrProviderSchema.options.join(', ')}`,
        });
        return;
      }
      const provider = req.body.provider ?? queryProvider.data.provider;
      const result = await ocrService.extractTextFromDocument(tempFilePath, provider);
      const processingTime = Date.now() - startTime;

      log.info(
        `OCR extraction completed in ${processingTime}ms: ${result.pageCount} pages, ${result.text.length} chars`
      );

      if (result.pageCount > MAX_PAGES) {
        log.warn(`Page limit exceeded: ${result.pageCount} pages (max ${MAX_PAGES})`);
        res.status(400).json({
          success: false,
          error: `Seitenlimit überschritten: Die Datei hat ${result.pageCount} Seiten (maximal ${MAX_PAGES} erlaubt).`,
        });
        return;
      }

      res.json({
        success: true,
        text: result.text,
        pageCount: result.pageCount,
        method: result.extractionMethod || 'mistral-ocr',
        fileInfo: {
          originalname,
          size,
          mimetype,
        },
      });
    } catch (err) {
      const error = err as Error;
      log.error('Scanner extraction error:', error.message);

      if (error.message.includes('Ungültiger Dateityp')) {
        res.status(400).json({
          success: false,
          error: error.message,
        });
        return;
      }

      if (error.message.includes('exceeds') || error.message.includes('limit')) {
        res.status(413).json({
          success: false,
          error: 'Datei ist zu groß. Maximale Größe: 50MB',
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Fehler bei der Textextraktion. Bitte versuche es erneut.',
      });
    } finally {
      // Clean up temp file
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
          log.debug(`Temp file deleted: ${tempFilePath}`);
        } catch {
          log.warn(`Failed to delete temp file: ${tempFilePath}`);
        }
      }
    }
  }
);

export default router;

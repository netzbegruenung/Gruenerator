/**
 * The two binary halves of document translation, as raw Express routes beside
 * `translationContract` (repo convention: `@ts-rest/express` has no multipart
 * handling — see documents/manualController.ts for the reference shape).
 *
 *   POST /api/translation/document               multipart upload → { jobId }
 *   GET  /api/translation/document/:jobId/result  the buffered translated file
 *
 * Text fields are validated with the contract's schema and the JSON responses
 * are typed against it, so web and mobile derive their types from one place.
 * Auth and consent come from the `/api/translation` prefix in routes.ts.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  TRANSLATION_DOCUMENT_EXTENSIONS,
  TRANSLATION_DOCUMENT_MAX_BYTES,
  translationDocumentUploadFieldsSchema,
  type TranslationDocumentUploadResponse,
  type TranslationError,
} from '@gruenerator/contracts';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import multer from 'multer';

import { DeepLError } from '../../services/translation/DeepLService.js';
import { documentJobFile, startDocumentJob } from '../../services/translation/documentJobs.js';
import {
  translationErrorMessage,
  TranslationUnavailableError,
} from '../../services/translation/translate.js';
import {
  toTreeBudgetStatusDto,
  TreeBudgetExceededError,
  TreeBudgetUnavailableError,
} from '../../services/trees/treeBudget.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';

const log = createLogger('translationUpload');

export const translationUploadRouter: Router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TRANSLATION_DOCUMENT_MAX_BYTES },
});

const FORMAT_HINT = TRANSLATION_DOCUMENT_EXTENSIONS.map((e) => `.${e}`).join(', ');

function fail(
  res: Response,
  status: number,
  error: string,
  extra: Partial<TranslationError> = {}
): void {
  const body: TranslationError = { success: false, error, ...extra };
  res.status(status).json(body);
}

function handleUploadRejection(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    fail(
      res,
      413,
      `Die Datei ist größer als ${Math.round(TRANSLATION_DOCUMENT_MAX_BYTES / (1024 * 1024))} MB und kann nicht übersetzt werden.`
    );
    return;
  }
  next(err);
}

translationUploadRouter.post(
  '/document',
  upload.single('document'),
  handleUploadRejection,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      fail(res, 401, 'Nicht angemeldet.');
      return;
    }
    const file = req.file;
    if (!file) {
      fail(res, 400, 'Keine Datei hochgeladen.');
      return;
    }
    const ext = path.extname(file.originalname).slice(1).toLowerCase();
    if (!(TRANSLATION_DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) {
      fail(
        res,
        415,
        `„${file.originalname}" kann nicht übersetzt werden. Unterstützt werden: ${FORMAT_HINT}.`
      );
      return;
    }
    const fields = translationDocumentUploadFieldsSchema.safeParse(req.body);
    if (!fields.success) {
      fail(res, 400, 'Zielsprache fehlt oder ist ungültig.');
      return;
    }
    if (fields.data.outputFormat && ext !== 'pdf') {
      fail(res, 400, 'Die Ausgabe als Word-Datei gibt es nur für PDF-Eingaben.');
      return;
    }

    try {
      const job = await startDocumentJob({
        userId,
        buffer: file.buffer,
        filename: file.originalname,
        targetLang: fields.data.targetLang,
        sourceLang: fields.data.sourceLang ?? null,
        formality: fields.data.formality ?? null,
        outputFormat: fields.data.outputFormat ?? null,
      });
      const body: TranslationDocumentUploadResponse = job;
      res.json(body);
    } catch (error) {
      if (error instanceof TreeBudgetExceededError) {
        fail(res, 429, error.message, { quota: toTreeBudgetStatusDto(error.status) });
        return;
      }
      if (error instanceof TreeBudgetUnavailableError) {
        fail(res, 503, error.message);
        return;
      }
      if (error instanceof TranslationUnavailableError) {
        fail(res, 503, translationErrorMessage(error));
        return;
      }
      if (error instanceof DeepLError) {
        fail(res, error.status === 400 ? 400 : 502, translationErrorMessage(error));
        return;
      }
      log.error('[POST /translation/document] Error:', error);
      fail(res, 500, translationErrorMessage(error));
    }
  }
);

translationUploadRouter.get(
  '/document/:jobId/result',
  async (req: AuthenticatedRequest<{ jobId: string }>, res: Response): Promise<void> => {
    const userId = req.user?.id;
    if (!userId) {
      fail(res, 401, 'Nicht angemeldet.');
      return;
    }
    const file = await documentJobFile(req.params.jobId, userId);
    if (!file) {
      fail(
        res,
        404,
        'Diese Übersetzung ist nicht (mehr) verfügbar. Bitte das Dokument erneut hochladen.'
      );
      return;
    }
    const stats = await fs.promises.stat(file.path);
    if (file.contentType) res.setHeader('Content-Type', file.contentType);
    else res.type(path.extname(file.filename) || 'application/octet-stream');
    res.setHeader('Content-Length', stats.size);
    setContentDisposition(res, file.filename);
    const stream = fs.createReadStream(file.path);
    stream.on('error', (err) => {
      log.error(`[translation] stream error for ${req.params.jobId}: ${err.message}`);
      if (!res.headersSent) res.status(500).end();
    });
    stream.pipe(res);
  }
);

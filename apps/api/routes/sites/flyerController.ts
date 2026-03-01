import path from 'path';

import express, { type Request, type Response, type Router, type NextFunction } from 'express';
import multer from 'multer';

import { runFlyerToSiteGraph } from '../../agents/langgraph/FlyerToSiteGraph/FlyerToSiteGraph.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('sites:flyer');
const router: Router = express.Router();

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error('Nur PDF-Dateien sind erlaubt.'));
    }
  },
});

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

router.post(
  '/',
  requireAuth as express.RequestHandler,
  upload.single('flyer') as express.RequestHandler,
  async (req: MulterRequest, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'Bitte lade eine PDF-Datei hoch.' });
        return;
      }

      log.debug('Flyer upload received', {
        filename: req.file.originalname,
        size: req.file.size,
        userId: req.user?.id,
      });

      const result = await runFlyerToSiteGraph({
        pdfBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
        email: req.body?.email,
        req,
      });

      if (!result.success) {
        log.error('Flyer pipeline failed', { error: result.error });
        res.status(500).json({
          error: 'Fehler bei der Verarbeitung des Flyers',
          details: result.error,
        });
        return;
      }

      res.json({
        json: result.json,
        metadata: result.metadata,
      });
    } catch (err) {
      log.error('Flyer controller error', { error: (err as Error).message });
      res.status(500).json({
        error: 'Fehler bei der Verarbeitung des Flyers',
        details: (err as Error).message,
      });
    }
  }
);

// Handle multer errors (file too large, wrong type)
router.use((err: any, _req: Request, res: Response, next: NextFunction): void => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: 'Die Datei ist zu groß. Maximal 20 MB erlaubt.' });
      return;
    }
    res.status(400).json({ error: `Upload-Fehler: ${err.message}` });
    return;
  }
  if (err?.message?.includes('Nur PDF')) {
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
});

export default router;

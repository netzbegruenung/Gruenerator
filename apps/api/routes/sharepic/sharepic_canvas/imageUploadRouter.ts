import { Router, type Request, type Response } from 'express';
import multer from 'multer';

import { createLogger } from '../../../utils/logger.js';

const log = createLogger('imageUpload');
const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

interface MulterRequest extends Request {
  file?: Express.Multer.File;
}

router.post(
  '/',
  upload.single('image'),
  async (req: MulterRequest, res: Response): Promise<void> => {
    log.debug('POST-Anfrage an /upload empfangen');
    log.debug('Headers:', JSON.stringify(req.headers, null, 2));

    try {
      if (!req.file) {
        log.debug('Kein Bild in der Anfrage gefunden');
        res.status(400).json({ error: 'Kein Bild hochgeladen' });
        return;
      }

      log.debug('Bild empfangen:', {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });

      log.debug('Bild erfolgreich empfangen und gespeichert');

      res.json({
        success: true,
        message: 'Bild erfolgreich hochgeladen',
        fileInfo: {
          originalname: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
      });
    } catch (err) {
      const error = err as Error;
      log.error('Fehler beim Bildupload:');
      log.error(error);
      log.error('Stack Trace:');
      log.error(error.stack);
      res.status(500).json({ error: 'Interner Serverfehler', details: error.message });
    }
  }
);

export default router;

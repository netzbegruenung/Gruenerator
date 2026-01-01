import express from 'express';
import multer from 'multer';
import { createLogger } from '../../../utils/logger.js';
const log = createLogger('imageUpload');


const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('image'), async (req, res) => {
  log.debug('POST-Anfrage an /upload empfangen');
  log.debug('Headers:', JSON.stringify(req.headers, null, 2));

  try {
    if (!req.file) {
      log.debug('Kein Bild in der Anfrage gefunden');
      return res.status(400).json({ error: 'Kein Bild hochgeladen' });
    }

    log.debug('Bild empfangen:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    const { buffer } = req.file;

    // Hier können Sie das buffer-Objekt für weitere Verarbeitung speichern oder weitergeben
    // Zum Beispiel: await saveBufferToDatabase(buffer);

    log.debug('Bild erfolgreich empfangen und gespeichert');

    res.json({ 
      success: true, 
      message: 'Bild erfolgreich hochgeladen',
      fileInfo: {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });

  } catch (err) {
    log.error('Fehler beim Bildupload:');
    log.error(err);
    log.error('Stack Trace:');
    log.error(err.stack);
    res.status(500).json({ error: 'Interner Serverfehler', details: err.message });
  }
});

export default router;
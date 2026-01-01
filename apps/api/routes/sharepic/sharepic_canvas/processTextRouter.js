import express from 'express';
import { processText } from './dreizeilen_canvas.js';
import { createLogger } from '../../../utils/logger.js';
const log = createLogger('processText');


const router = express.Router();

router.post('/', async (req, res) => {
  log.debug('POST-Anfrage an /api/processText empfangen');
  log.debug('Body der Anfrage:', req.body);

  try {
    const result = await processText(req.body);
    res.json({ success: true, message: 'Text erfolgreich verarbeitet', result });
  } catch (error) {
    log.error('Fehler bei der Textverarbeitung:', error);
    res.status(500).json({ error: error.message || 'Interner Serverfehler bei der Textverarbeitung' });
  }
});

export default router;
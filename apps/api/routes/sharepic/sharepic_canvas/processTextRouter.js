const express = require('express');
const { processText } = require('./dreizeilen_canvas');
const { createLogger } = require('../../../utils/logger.js');
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

module.exports = router;
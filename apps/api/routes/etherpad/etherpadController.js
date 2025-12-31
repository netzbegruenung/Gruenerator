const express = require('express');
const router = express.Router();
const { createPadWithText } = require('./etherpadService');
const { generateSecureId } = require('../../utils/securityUtils');
const { createLogger } = require('../../utils/logger.js');
const log = createLogger('etherpad');


router.post('/create', async (req, res) => {
  try {
    const { text, documentType } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text ist erforderlich' });
    }

    const padId = generateSecureId();
    const padURL = await createPadWithText(padId, text, documentType);
    
    res.json({ padURL });
  } catch (error) {
    log.error('Fehler beim Erstellen des Etherpads:', error);
    res.status(500).json({ error: 'Interner Serverfehler beim Erstellen des Etherpads' });
  }
});

module.exports = router;

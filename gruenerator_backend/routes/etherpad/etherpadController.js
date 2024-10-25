const express = require('express');
const router = express.Router();
const { createPadWithText } = require('./etherpadService');
const { generateSecureId } = require('../../utils/securityUtils');

router.post('/create', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text ist erforderlich' });
    }

    const padId = generateSecureId();
    
    const padURL = await createPadWithText(padId, text);
    
    res.json({ padURL });
  } catch (error) {
    console.error('Fehler beim Erstellen des Etherpads:', error);
    res.status(500).json({ error: 'Interner Serverfehler beim Erstellen des Etherpads' });
  }
});

module.exports = router;

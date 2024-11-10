// src/routes/claude_text_adjustment.js
const express = require('express');
const router = express.Router();
require('dotenv').config(); // Lädt die .env Datei
const AIRequestManager = require('../utils/AIRequestManager');

router.post('/', async (req, res) => {
  try {
    const result = await AIRequestManager.processRequest({
      type: 'text_adjustment',
      prompt: req.body.prompt,
      options: req.body.options
    });

    if (result.success) {
      res.json({ 
        success: true, 
        content: result.result 
      });
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('Fehler bei der KI-Anfrage:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Verarbeitung der KI-Anfrage',
      details: error.message 
    });
  }
});

module.exports = router;

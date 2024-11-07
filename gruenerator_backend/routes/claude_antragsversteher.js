const express = require('express');
const multer = require('multer');
const { Anthropic } = require('@anthropic-ai/sdk');
const router = express.Router();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/upload-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('Keine Datei hochgeladen');
  }

  try {
    const fileBuffer = req.file.buffer;
    const base64PDF = fileBuffer.toString('base64');

    const response = await anthropic.beta.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      betas: ["pdfs-2024-09-25"],
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64PDF
            }
          },
          {
            type: 'text',
            text: `Sie sind ein hilfreicher kommunalpolitischer Berater von Bündnis 90/Die Grünen. Bitte lesen Sie das folgende Dokument, das ein Antrag, eine Vorlage oder ähnliches ist, ausführlich. Geben Sie dann folgende Informationen:
                  1. Eine kurze Beschreibung, worum es in dem Text geht.
                  2. Positive Aspekte aus Sicht der Partei.
                  3. Negative und kritische Aspekte aus Sicht der Partei.
                  4. Mögliche Rückfragen für die kommende Sitzung, falls notwendig.
                  Stellen Sie sicher, dass die Antwort objektiv, sachlich und präzise ist.`
          }
        ]
      }]
    });

    if (response && response.content && response.content.length > 0) {
      const summary = response.content[0].text;
      res.json({ summary: summary });
    } else {
      throw new Error('API response missing or incorrect content structure');
    }
  } catch (error) {
    console.error('Fehler bei der Verarbeitung:', error.message);
    res.status(500).send('Interner Serverfehler');
  }
});

module.exports = router;
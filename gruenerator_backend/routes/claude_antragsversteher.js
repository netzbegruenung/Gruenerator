const express = require('express');
const multer = require('multer');
const { Anthropic } = require('@anthropic-ai/sdk');
const { MARKDOWN_CHAT_INSTRUCTIONS } = require('../utils/promptUtils');
const router = express.Router();

// Anthropic client for Files API
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

// Multer configuration for PDF upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/upload-pdf', upload.single('file'), async (req, res) => {


  if (!req.file) {
    return res.status(400).send('Keine Datei hochgeladen');
  }

  try {
    const fileBuffer = req.file.buffer;
    const fileName = req.file.originalname || 'document.pdf';

    // Upload file to Claude Files API
    const fileUpload = await anthropic.beta.files.upload({
      file: fileBuffer,
      name: fileName,
      type: 'application/pdf'
    });

    console.log('[Antragsversteher] File uploaded to Claude Files API:', fileUpload.id);

    // Process with AI Worker Pool using file_id
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'antragsversteher',
      systemPrompt: 'Sie sind ein hilfreicher kommunalpolitischer Berater von Bündnis 90/Die Grünen.',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'file',
              file_id: fileUpload.id
            }
          },
          {
            type: 'text',
            text: `Bitte lesen Sie das folgende Dokument, das ein Antrag, eine Vorlage oder ähnliches ist, ausführlich. Geben Sie dann folgende Informationen:
                  1. Eine kurze Beschreibung, worum es in dem Text geht.
                  2. Positive Aspekte aus Sicht der Partei.
                  3. Negative und kritische Aspekte aus Sicht der Partei.
                  4. Mögliche Rückfragen für die kommende Sitzung, falls notwendig.
                  Stellen Sie sicher, dass die Antwort objektiv, sachlich und präzise ist.

                  ${MARKDOWN_CHAT_INSTRUCTIONS}`
          }
        ]
      }],
      options: {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        temperature: 0.3
            },
        fileMetadata: {
        fileId: fileUpload.id,
        fileName: fileName,
        usePromptCaching: true
      }
    });

    if (!result.success) {
      throw new Error(result.error || 'Fehler bei der PDF-Analyse');
    }

    res.json({ 
      success: true,
      summary: result.content,
      fileId: fileUpload.id
    });

  } catch (error) {
    console.error('Fehler bei der PDF-Verarbeitung:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der PDF-Analyse',
      details: error.message
    });
  }
});

module.exports = router;
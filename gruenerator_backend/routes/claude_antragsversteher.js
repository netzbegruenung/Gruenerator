const express = require('express');
const multer = require('multer');
const router = express.Router();

// Multer Konfiguration für PDF-Upload
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/upload-pdf', upload.single('file'), async (req, res) => {
  const useBackupProvider = req.body.useBackupProvider;

  if (!req.file) {
    return res.status(400).send('Keine Datei hochgeladen');
  }

  try {
    const fileBuffer = req.file.buffer;
    const base64PDF = fileBuffer.toString('base64');

    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'antragsversteher',
      systemPrompt: 'Sie sind ein hilfreicher kommunalpolitischer Berater von Bündnis 90/Die Grünen.',
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
            text: `Bitte lesen Sie das folgende Dokument, das ein Antrag, eine Vorlage oder ähnliches ist, ausführlich. Geben Sie dann folgende Informationen:
                  1. Eine kurze Beschreibung, worum es in dem Text geht.
                  2. Positive Aspekte aus Sicht der Partei.
                  3. Negative und kritische Aspekte aus Sicht der Partei.
                  4. Mögliche Rückfragen für die kommende Sitzung, falls notwendig.
                  Stellen Sie sicher, dass die Antwort objektiv, sachlich und präzise ist.`
          }
        ]
      }],
      options: {
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 2048,
        temperature: 0.3,
        betas: ["pdfs-2024-09-25"]  // Wichtig für PDF-Verarbeitung
      },
      useBackupProvider
    });

    if (!result.success) {
      throw new Error(result.error || 'Fehler bei der PDF-Analyse');
    }

    res.json({ 
      success: true,
      summary: result.content 
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
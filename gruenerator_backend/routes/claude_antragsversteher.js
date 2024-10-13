const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const { createWorker } = require('tesseract.js');
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
    let extractedText = '';
    let usedOCR = false;

    // Versuche zuerst, Text direkt aus der PDF zu extrahieren
    try {
      const data = await pdf(fileBuffer);
      extractedText = data.text;
    } catch (pdfError) {
      console.log('Fehler bei der PDF-Textextraktion, versuche OCR:', pdfError);
    }

    // Wenn kein Text extrahiert wurde, wende OCR an
    if (!extractedText.trim()) {
      const worker = await createWorker('deu');
      const { data: { text } } = await worker.recognize(fileBuffer);
      await worker.terminate();
      extractedText = text;
      usedOCR = true;
    }

    if (!extractedText.trim()) {
      return res.status(422).json({ error: 'Konnte keinen Text aus der Datei extrahieren.' });
    }

    // Weiterleitung des extrahierten Textes an die Claude API
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20240620',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Sie sind ein hilfreicher kommunalpolitischer Berater von Bündnis 90/Die Grünen. Bitte lesen Sie das folgende Dokument, das ein Antrag, eine Vorlage oder ähnliches ist, ausführlich. Geben Sie dann folgende Informationen:
                  1. Eine kurze Beschreibung, worum es in dem Text geht.
                  2. Positive Aspekte aus Sicht der Partei.
                  3. Negative und kritische Aspekte aus Sicht der Partei.
                  4. Mögliche Rückfragen für die kommende Sitzung, falls notwendig.
                  Stellen Sie sicher, dass die Antwort objektiv, sachlich und präzise ist.
                  Hier ist der Text: <paper>${extractedText}</paper>`
      }]
    });

    if (response && response.content && Array.isArray(response.content)) {
      const summary = response.content.map(item => item.text).join("\n");
      res.json({ text: extractedText, summary: summary, usedOCR: usedOCR });
    } else {
      throw new Error('API response missing or incorrect content structure');
    }
  } catch (error) {
    console.error('Fehler bei der Verarbeitung:', error.message);
    res.status(500).send('Interner Serverfehler');
  }
});

module.exports = router;
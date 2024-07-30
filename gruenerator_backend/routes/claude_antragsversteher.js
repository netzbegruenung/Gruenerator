const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { Anthropic } = require('@anthropic-ai/sdk');
const router = express.Router();
const dotenv = require('dotenv');

dotenv.config();

const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, 'uploads');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }

  const filePath = path.join(__dirname, 'uploads', req.file.filename);

  try {
    const fileBuffer = await fs.promises.readFile(filePath);

    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype
    });

    const uploadResponse = await axios.post(process.env.PDF_TEXT_EXTRACTION_ENDPOINT, formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${process.env.CLAUDE_API_KEY}`
      },
    });

    const { text } = uploadResponse.data;
    res.json({ text });

    await fs.promises.unlink(filePath);
  } catch (error) {
    console.error('Error processing the PDF:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

router.post('/api', async (req, res) => {
  const { text } = req.body;

  try {
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
                  Hier ist der Text: <paper>${text}</paper>`
      }]
    });

    if (response && response.content && Array.isArray(response.content)) {
      const textContent = response.content.map(item => item.text).join("\n");
      res.json({ summary: textContent });
    } else {
      res.status(500).send('API response missing or incorrect content structure');
    }
  } catch (error) {
    console.error('Error with Claude API:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
//pdf-text-ectraction.js
const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const router = express.Router();

// Configure multer storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// PDF Text Extraction Endpoint für Antragsversteher
router.post('/api/antragsversteher/upload-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) {
    console.log('Keine Datei im Antragsversteher-PDF-Upload empfangen');
    return res.status(400).send('Keine Datei hochgeladen');
  }
  
  try {
    const fileBuffer = req.file.buffer;
    const data = await pdf(fileBuffer);
   
    if (!data || !data.text) {
      console.log('Kein Text aus der PDF für Antragsversteher extrahiert');
      return res.status(422).json({ error: 'Fehler beim Extrahieren des Textes aus der PDF. Die Datei könnte leer oder beschädigt sein.' });
    }
    
    console.log('PDF-Textextraktion für Antragsversteher erfolgreich');
    res.json({ text: data.text });
  } catch (error) {
    console.error('Fehler beim Extrahieren des Textes aus der PDF für Antragsversteher:', error.message);
    res.status(500).send('Interner Serverfehler');
  }
});

module.exports = router;
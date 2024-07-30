const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const config = require('./config');
const { addTextToImage } = require('./dreizeilen_canvas');

const router = express.Router();

const TEMP_DIR = config.TEMP_UPLOAD_DIR;
const FILE_EXPIRY = 60 * 60 * 1000; // 60 Minuten in Millisekunden

// Multer Konfiguration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, TEMP_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const filename = 'upload-' + uniqueSuffix + path.extname(file.originalname);
    cb(null, filename);
  }
});

const upload = multer({ storage: storage });

router.post('/', upload.single('image'), async (req, res) => {
  console.log('Anfrage an /api/upload empfangen');
  console.log('Headers:', req.headers);
  
  try {
    console.log('Body der Anfrage:', req.body);
    console.log('Hochgeladene Datei:', req.file);

    if (!req.file) {
      console.log('Kein Bild in der Anfrage gefunden');
      return res.status(400).json({ error: 'Kein Bild hochgeladen' });
    }

    const imagePath = req.file.path;
    console.log('Bild gespeichert unter:', imagePath);

    // Extrahiere die notwendigen Parameter aus req.body
    const { line1, line2, line3, ...otherParams } = req.body;
    console.log('Extrahierte Textzeilen:', { line1, line2, line3 });
    console.log('Andere Parameter:', otherParams);

    const textLines = [line1, line2, line3];

    // Rufe die addTextToImage Funktion mit dem hochgeladenen Bild auf
    const imageBuffer = await addTextToImage(imagePath, textLines, otherParams);

    // Konvertiere das Bild zu Base64
    const base64Image = `data:image/png;base64,${imageBuffer.toString('base64')}`;

    res.json({ success: true, image: base64Image });

    // Plane das Löschen der Datei nach 60 Minuten
    setTimeout(() => {
      fs.unlink(imagePath).catch(console.error);
    }, FILE_EXPIRY);
  } catch (err) {
    console.error('Fehler beim Bildupload oder der Verarbeitung:', err);
    res.status(500).json({ error: 'Interner Serverfehler', details: err.message });
  }
});

module.exports = router;
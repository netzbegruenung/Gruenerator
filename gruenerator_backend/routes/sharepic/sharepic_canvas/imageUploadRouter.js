const express = require('express');
const multer = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post('/', upload.single('image'), async (req, res) => {
  console.log('POST-Anfrage an /upload empfangen');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));

  try {
    if (!req.file) {
      console.log('Kein Bild in der Anfrage gefunden');
      return res.status(400).json({ error: 'Kein Bild hochgeladen' });
    }

    console.log('Bild empfangen:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    const { buffer } = req.file;

    // Hier können Sie das buffer-Objekt für weitere Verarbeitung speichern oder weitergeben
    // Zum Beispiel: await saveBufferToDatabase(buffer);

    console.log('Bild erfolgreich empfangen und gespeichert');

    res.json({ 
      success: true, 
      message: 'Bild erfolgreich hochgeladen',
      fileInfo: {
        originalname: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });

  } catch (err) {
    console.error('Fehler beim Bildupload:');
    console.error(err);
    console.error('Stack Trace:');
    console.error(err.stack);
    res.status(500).json({ error: 'Interner Serverfehler', details: err.message });
  }
});

module.exports = router;
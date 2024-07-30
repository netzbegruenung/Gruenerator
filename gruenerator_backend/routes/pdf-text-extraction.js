const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const router = express.Router();

// Configure multer storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// PDF Text Extraction Endpoint
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    console.log('No file received in PDF extraction request');
    return res.status(400).send('No file uploaded');
  }

  try {
    const fileBuffer = req.file.buffer;
    const data = await pdf(fileBuffer);
    
    if (!data || !data.text) {
      console.log('No text extracted from PDF');
      return res.status(422).json({ error: 'Failed to extract text from PDF. The file may be empty or corrupted.' });
    }

    console.log('PDF text extraction successful');
    res.json({ text: data.text });
  } catch (error) {
    console.error('Error extracting text from PDF:', error.message);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
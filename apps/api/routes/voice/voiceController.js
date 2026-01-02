import express from 'express';
const router = express.Router();
import multer from 'multer';
import mistralVoiceService from '../../services/voice/mistralVoiceService.js';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('voice');


// Konfiguration für Multer (Memory-Upload für direkte Verarbeitung)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB Limit (Mistral supports ~15 minutes)
  fileFilter: (_, file, cb) => {
    // Check if audio format is supported by Mistral
    if (mistralVoiceService.isFormatSupported(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}. Supported formats: ${mistralVoiceService.getSupportedFormats().join(', ')}`));
    }
  }
});




// POST /api/voice/transcribe - Transkribiere Audio-Datei mit Mistral Voxtral
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Keine Audio-Datei erhalten'
    });
  }

  const audioBuffer = req.file.buffer;
  const filename = req.file.originalname;

  // Optionen aus Query-Parametern oder Body extrahieren
  const options = {
    language: req.query.language || req.body.language || 'de',
    removeTimestamps: req.query.removeTimestamps === 'true' || req.body.removeTimestamps === true,
    timestamp_granularities: (req.query.timestamps === 'true' || req.body.timestamps === true) ? ['segment'] : undefined
  };

  try {
    log.debug('[Voice Controller] Starting transcription for:', filename, 'Options:', options);

    const result = await mistralVoiceService.transcribeFromBuffer(audioBuffer, filename, options);

    return res.json({
      success: true,
      text: result.text,
      segments: result.segments || undefined,
      hasTimestamps: result.hasTimestamps,
      language: options.language
    });
  } catch (error) {
    log.error('[Voice Controller] Transcription error:', error);

    return res.status(500).json({
      success: false,
      error: 'Fehler bei der Transkription: ' + error.message
    });
  }
});

// POST /api/voice/transcribe-url - Transkribiere Audio von URL
router.post('/transcribe-url', async (req, res) => {
  const { url, language = 'de', removeTimestamps = false, timestamps = false } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Audio URL ist erforderlich'
    });
  }

  const options = {
    language,
    removeTimestamps,
    timestamp_granularities: timestamps ? ['segment'] : undefined
  };

  try {
    log.debug('[Voice Controller] Starting URL transcription for:', url, 'Options:', options);

    const result = await mistralVoiceService.transcribeFromUrl(url, options);

    return res.json({
      success: true,
      text: result.text,
      segments: result.segments || undefined,
      hasTimestamps: result.hasTimestamps,
      language: options.language,
      sourceUrl: url
    });
  } catch (error) {
    log.error('[Voice Controller] URL transcription error:', error);

    return res.status(500).json({
      success: false,
      error: 'Fehler bei der URL-Transkription: ' + error.message
    });
  }
});

// POST /api/voice/chat - Chat mit Audio-Eingabe
router.post('/chat', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Keine Audio-Datei erhalten'
    });
  }

  const audioBuffer = req.file.buffer;
  const filename = req.file.originalname;
  const prompt = req.body.prompt || req.query.prompt || "Was ist in dieser Audio-Datei?";

  try {
    log.debug('[Voice Controller] Starting audio chat for:', filename, 'Prompt:', prompt);

    const response = await mistralVoiceService.chatWithAudio(audioBuffer, filename, prompt);

    return res.json({
      success: true,
      response: response,
      prompt: prompt
    });
  } catch (error) {
    log.error('[Voice Controller] Audio chat error:', error);

    return res.status(500).json({
      success: false,
      error: 'Fehler beim Audio-Chat: ' + error.message
    });
  }
});

// GET /api/voice/formats - Unterstützte Audio-Formate
router.get('/formats', (_, res) => {
  try {
    const formats = mistralVoiceService.getSupportedFormats();

    return res.json({
      success: true,
      supportedFormats: formats,
      maxFileSize: '50MB',
      maxDuration: '~15 minutes for transcription, ~20 minutes for chat',
      provider: 'Mistral Voxtral'
    });
  } catch (error) {
    log.error('[Voice Controller] Formats error:', error);

    return res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der unterstützten Formate'
    });
  }
});

export default router;
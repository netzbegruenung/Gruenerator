/**
 * Voice Controller
 * Handles audio transcription and chat using Mistral Voxtral
 */

import express, { Request, Response, Router } from 'express';
import multer, { FileFilterCallback } from 'multer';
import mistralVoiceService from '../../services/voice/mistralVoiceService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('voice');

// ============================================================================
// Types
// ============================================================================

interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

interface TranscriptionResult {
  text: string;
  segments?: TranscriptionSegment[];
  hasTimestamps: boolean;
}

interface TranscribeRequest extends Request {
  file?: Express.Multer.File;
  body: {
    language?: string;
    removeTimestamps?: boolean;
    timestamps?: boolean;
  };
  query: {
    language?: string;
    removeTimestamps?: string;
    timestamps?: string;
  };
}

interface TranscribeUrlRequest extends Request {
  body: {
    url: string;
    language?: string;
    removeTimestamps?: boolean;
    timestamps?: boolean;
  };
}

interface ChatRequest extends Request {
  file?: Express.Multer.File;
  body: {
    prompt?: string;
  };
  query: {
    prompt?: string;
  };
}

interface TranscribeResponse {
  success: boolean;
  text?: string;
  segments?: TranscriptionSegment[];
  hasTimestamps?: boolean;
  language?: string;
  error?: string;
}

interface TranscribeUrlResponse extends TranscribeResponse {
  sourceUrl?: string;
}

interface ChatResponse {
  success: boolean;
  response?: string;
  prompt?: string;
  error?: string;
}

interface FormatsResponse {
  success: boolean;
  supportedFormats?: string[];
  maxFileSize?: string;
  maxDuration?: string;
  provider?: string;
  error?: string;
}

type TimestampGranularity = 'segment';

interface TranscriptionOptions {
  language?: string;
  removeTimestamps?: boolean;
  timestamp_granularities?: TimestampGranularity[];
}

// ============================================================================
// Router Setup
// ============================================================================

const router: Router = express.Router();

// Multer configuration for in-memory upload
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB Limit (Mistral supports ~15 minutes)
  fileFilter: (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (mistralVoiceService.isFormatSupported(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(
        `Unsupported audio format: ${file.mimetype}. Supported formats: ${mistralVoiceService.getSupportedFormats().join(', ')}`
      ));
    }
  }
});

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/voice/transcribe
 * Transcribe audio file with Mistral Voxtral
 */
router.post('/transcribe', upload.single('audio'), async (req: TranscribeRequest, res: Response<TranscribeResponse>) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Keine Audio-Datei erhalten'
    });
  }

  const audioBuffer = req.file.buffer;
  const filename = req.file.originalname;

  const options: TranscriptionOptions = {
    language: req.query.language || req.body.language || 'de',
    removeTimestamps: req.query.removeTimestamps === 'true' || req.body.removeTimestamps === true,
    timestamp_granularities: (req.query.timestamps === 'true' || req.body.timestamps === true)
      ? ['segment']
      : undefined
  };

  try {
    log.debug('[Voice] Starting transcription for:', filename, 'Options:', options);

    const result = await mistralVoiceService.transcribeFromBuffer(
      audioBuffer,
      filename,
      options
    ) as unknown as TranscriptionResult;

    return res.json({
      success: true,
      text: result.text,
      segments: result.segments,
      hasTimestamps: result.hasTimestamps,
      language: options.language
    });
  } catch (error) {
    log.error('[Voice] Transcription error:', error);

    return res.status(500).json({
      success: false,
      error: 'Fehler bei der Transkription: ' + (error as Error).message
    });
  }
});

/**
 * POST /api/voice/transcribe-url
 * Transcribe audio from URL
 */
router.post('/transcribe-url', async (req: TranscribeUrlRequest, res: Response<TranscribeUrlResponse>) => {
  const { url, language = 'de', removeTimestamps = false, timestamps = false } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Audio URL ist erforderlich'
    });
  }

  const options: TranscriptionOptions = {
    language,
    removeTimestamps,
    timestamp_granularities: timestamps ? ['segment'] : undefined
  };

  try {
    log.debug('[Voice] Starting URL transcription for:', url, 'Options:', options);

    const result = await mistralVoiceService.transcribeFromUrl(url, options) as unknown as TranscriptionResult;

    return res.json({
      success: true,
      text: result.text,
      segments: result.segments,
      hasTimestamps: result.hasTimestamps,
      language: options.language,
      sourceUrl: url
    });
  } catch (error) {
    log.error('[Voice] URL transcription error:', error);

    return res.status(500).json({
      success: false,
      error: 'Fehler bei der URL-Transkription: ' + (error as Error).message
    });
  }
});

/**
 * POST /api/voice/chat
 * Chat with audio input
 */
router.post('/chat', upload.single('audio'), async (req: ChatRequest, res: Response<ChatResponse>) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'Keine Audio-Datei erhalten'
    });
  }

  const audioBuffer = req.file.buffer;
  const filename = req.file.originalname;
  const prompt = req.body.prompt || req.query.prompt || 'Was ist in dieser Audio-Datei?';

  try {
    log.debug('[Voice] Starting audio chat for:', filename, 'Prompt:', prompt);

    const response: string = await mistralVoiceService.chatWithAudio(audioBuffer, filename, prompt);

    return res.json({
      success: true,
      response,
      prompt
    });
  } catch (error) {
    log.error('[Voice] Audio chat error:', error);

    return res.status(500).json({
      success: false,
      error: 'Fehler beim Audio-Chat: ' + (error as Error).message
    });
  }
});

/**
 * GET /api/voice/formats
 * Get supported audio formats
 */
router.get('/formats', (_req: Request, res: Response<FormatsResponse>) => {
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
    log.error('[Voice] Formats error:', error);

    return res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der unterstützten Formate'
    });
  }
});

export default router;

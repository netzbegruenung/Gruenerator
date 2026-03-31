import express, { type Request, type Response, type Router } from 'express';

import ttsService from '../../services/voice/ttsService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ttsController');

const router: Router = express.Router();

const MAX_TEXT_LENGTH = 8192;

interface GenerateRequest extends Request {
  body: {
    text?: string;
    modelId?: string;
    voiceId?: string;
    refAudio?: string;
    language?: string;
  };
}

router.post('/generate', async (req: GenerateRequest, res: Response) => {
  const { text, modelId, voiceId, refAudio, language } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'Text ist erforderlich' });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({
      success: false,
      error: `Text darf maximal ${MAX_TEXT_LENGTH} Zeichen lang sein`,
    });
  }

  try {
    const wavBuffer = await ttsService.generateSpeech(text, {
      modelId,
      voiceId,
      refAudio,
      language,
    });

    res.set({
      'Content-Type': 'audio/wav',
      'Content-Length': String(wavBuffer.length),
      'Content-Disposition': 'inline; filename="speech.wav"',
    });
    return res.send(wavBuffer);
  } catch (error) {
    log.error('[TTS] Generate error:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler bei der Sprachsynthese: ' + (error as Error).message,
    });
  }
});

router.post('/stream', async (req: GenerateRequest, res: Response) => {
  const { text, modelId, voiceId, refAudio, language } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ success: false, error: 'Text ist erforderlich' });
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(400).json({
      success: false,
      error: `Text darf maximal ${MAX_TEXT_LENGTH} Zeichen lang sein`,
    });
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  try {
    await ttsService.streamSpeech(
      text,
      { modelId, voiceId, refAudio, language },
      {
        onChunk: (chunk) => {
          res.write(
            `event: audio_chunk\ndata: ${JSON.stringify({
              audio: chunk.audio,
              index: chunk.index,
              sampleRate: chunk.sampleRate,
            })}\n\n`
          );
        },
        onDone: (stats) => {
          res.write(`event: done\ndata: ${JSON.stringify(stats)}\n\n`);
          res.end();
        },
        onError: (error) => {
          res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
          res.end();
        },
      }
    );
  } catch (error) {
    log.error('[TTS] Stream error:', error);
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
      res.end();
    }
  }

  if (!res.writableEnded) {
    res.end();
  }
});

router.get('/voices', async (req: Request, res: Response) => {
  const language = req.query.language as string | undefined;

  try {
    const voices = await ttsService.listVoices(language);
    return res.json({ success: true, voices });
  } catch (error) {
    log.error('[TTS] List voices error:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Stimmen: ' + (error as Error).message,
    });
  }
});

router.get('/models', async (_req: Request, res: Response) => {
  try {
    const models = await ttsService.listModels();
    return res.json({ success: true, models });
  } catch (error) {
    log.error('[TTS] List models error:', error);
    return res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Modelle: ' + (error as Error).message,
    });
  }
});

export default router;

import express from 'express';
const router = express.Router();
import { generateShortSubtitlesViaAI } from './subtitler/services/shortSubtitleGeneratorService.js';
import { createLogger } from '../utils/logger.js';
const log = createLogger('claude_subtitle');


router.post('/generate-short-subtitles', async (req, res) => {
  const { text, words } = req.body;

  if (!text || !Array.isArray(words) || words.length === 0) {
    return res.status(400).json({ 
      error: 'Volltext (text) und Wort-Timestamps (words) sind erforderlich.' 
    });
  }

  try {
    const subtitles = await generateShortSubtitlesViaAI(
      text,
      words,
      req.app.locals.aiWorkerPool,

    );

    res.json({ 
      content: subtitles
    });

  } catch (error) {
    log.error('Fehler im /generate-short-subtitles Handler nach Aufruf des Service:', error);
    res.status(500).json({ 
      error: 'Fehler bei der Erstellung der kurzen Untertitel',
      details: error.message 
    });
  }
});

export default router;
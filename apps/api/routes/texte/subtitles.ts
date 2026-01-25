import express, { Router, Request, Response } from 'express';
import { generateShortSubtitlesViaAI } from '../../services/subtitler/shortSubtitleGeneratorService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('claude_subtitle');
const router: Router = express.Router();

interface SubtitleWord {
  text: string;
  start: number;
  end: number;
}

interface SubtitleRequestBody {
  text: string;
  words: SubtitleWord[];
}

router.post('/generate-short-subtitles', async (req: Request, res: Response): Promise<void> => {
  const { text, words } = req.body as SubtitleRequestBody;

  if (!text || !Array.isArray(words) || words.length === 0) {
    res.status(400).json({
      error: 'Volltext (text) und Wort-Timestamps (words) sind erforderlich.',
    });
    return;
  }

  try {
    const wordTimestamps = words.map((w) => ({ word: w.text, start: w.start, end: w.end }));
    const subtitles = await generateShortSubtitlesViaAI(
      text,
      wordTimestamps,
      req.app.locals.aiWorkerPool
    );

    res.json({
      content: subtitles,
    });
  } catch (error) {
    log.error('Fehler im /generate-short-subtitles Handler nach Aufruf des Service:', error);
    res.status(500).json({
      error: 'Fehler bei der Erstellung der kurzen Untertitel',
      details: (error as Error).message,
    });
  }
});

export default router;

import express, { type Router, type Response } from 'express';
import { z } from 'zod';

import { validateBody, type TypedRequest } from '../../middleware/validateBody.js';
import { generateShortSubtitlesViaAI } from '../../services/subtitler/shortSubtitleGeneratorService.js';
import { getAIWorkerPool } from '../../utils/getAIWorkerPool.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('claude_subtitle');
const router: Router = express.Router();

const subtitleWordSchema = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
});

const generateShortSubtitlesSchema = z.object({
  text: z.string().min(1),
  words: z.array(subtitleWordSchema).min(1),
});

router.post(
  '/generate-short-subtitles',
  validateBody(generateShortSubtitlesSchema),
  async (
    req: TypedRequest<z.infer<typeof generateShortSubtitlesSchema>>,
    res: Response
  ): Promise<void> => {
    const { text, words } = req.body;

    try {
      const wordTimestamps = words.map((w) => ({ word: w.text, start: w.start, end: w.end }));
      const subtitles = await generateShortSubtitlesViaAI(
        text,
        wordTimestamps,
        getAIWorkerPool(req)
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
  }
);

export default router;

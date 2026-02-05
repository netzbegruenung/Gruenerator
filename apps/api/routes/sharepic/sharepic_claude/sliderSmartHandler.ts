import prompts from '../../../prompts/sharepic/index.js';
import { createLogger } from '../../../utils/logger.js';
import { replaceTemplate } from '../../../utils/sharepic/template.js';

import { handleUnifiedRequest } from './unifiedHandler.js';

import type { SharepicRequest } from './types.js';
import type { Response } from 'express';

const log = createLogger('slider_smart');

interface SliderPromptConfig {
  countAnalysisSystemRole?: string;
  countAnalysisTemplate?: string;
  countAnalysisOptions?: Record<string, unknown>;
}

const DEFAULT_CONTENT_SLIDES = 2;
const MIN_CONTENT_SLIDES = 1;
const MAX_CONTENT_SLIDES = 3;

/**
 * Analyzes the topic to determine the optimal number of content slides (1-3).
 * Uses a fast, low-token AI call to assess topic complexity.
 */
async function analyzeSlideCount(
  req: SharepicRequest,
  thema: string,
  details: string
): Promise<number> {
  const sliderConfig = prompts.slider as SliderPromptConfig;

  if (!sliderConfig.countAnalysisTemplate || !sliderConfig.countAnalysisSystemRole) {
    log.warn('[analyzeSlideCount] Missing count analysis config, using default');
    return DEFAULT_CONTENT_SLIDES;
  }

  const requestContent = replaceTemplate(sliderConfig.countAnalysisTemplate, {
    thema: thema || '',
    details: details || '',
  });

  try {
    const result = await req.app.locals.aiWorkerPool.processRequest(
      {
        type: 'slider_count_analysis',
        systemPrompt: sliderConfig.countAnalysisSystemRole,
        messages: [{ role: 'user', content: requestContent }],
        options: sliderConfig.countAnalysisOptions || { max_tokens: 10, temperature: 0.3 },
      },
      req
    );

    if (!result.success || !result.content) {
      log.warn('[analyzeSlideCount] AI call failed, using default');
      return DEFAULT_CONTENT_SLIDES;
    }

    const match = result.content.match(/[1-3]/);
    if (!match) {
      log.warn(`[analyzeSlideCount] Invalid response "${result.content}", using default`);
      return DEFAULT_CONTENT_SLIDES;
    }

    const count = parseInt(match[0], 10);
    if (count < MIN_CONTENT_SLIDES || count > MAX_CONTENT_SLIDES) {
      log.warn(`[analyzeSlideCount] Count ${count} out of range, using default`);
      return DEFAULT_CONTENT_SLIDES;
    }

    log.info(
      `[analyzeSlideCount] Determined ${count} content slides for topic: "${thema?.substring(0, 50)}..."`
    );
    return count;
  } catch (error) {
    log.error('[analyzeSlideCount] Exception:', error);
    return DEFAULT_CONTENT_SLIDES;
  }
}

/**
 * Smart slider handler that first determines the optimal number of slides,
 * then generates that exact number.
 *
 * Total slides = 1 cover + (1-3 content) + 1 last = 3-5 slides
 */
export async function handleSliderSmartRequest(req: SharepicRequest, res: Response): Promise<void> {
  const { thema, details } = req.body;

  log.info(
    `[handleSliderSmartRequest] Starting smart generation for: "${thema?.substring(0, 50)}..."`
  );

  const contentSlides = await analyzeSlideCount(req, thema || '', details || '');
  const totalSlides = contentSlides + 2;

  log.info(
    `[handleSliderSmartRequest] Generating ${totalSlides} total slides (${contentSlides} content)`
  );

  req.body.count = totalSlides;

  return handleUnifiedRequest(req, res, 'slider');
}

export { analyzeSlideCount };

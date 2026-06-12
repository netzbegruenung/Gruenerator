/**
 * Slider deck text generation for the chat pipeline. Reuses the image-studio
 * slider stack without an HTTP round-trip: AI-determined slide count
 * (`analyzeSlideCount`) → unified multi-slide prompt (`generateUnifiedTexts`).
 */
import { analyzeSlideCount } from '../../routes/sharepic/sharepic_claude/sliderSmartHandler.js';
import { generateUnifiedTexts } from '../../routes/sharepic/sharepic_claude/unifiedHandler.js';
import { createLogger } from '../../utils/logger.js';

import type { SharepicRequest } from '../../routes/sharepic/sharepic_claude/types.js';
import type { Request } from 'express';

const log = createLogger('SliderGeneration');

export interface SliderSlide {
  label: string;
  headline: string;
  subtext: string;
  subtext2: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function toSlide(raw: Record<string, unknown> | string): SliderSlide {
  const data = typeof raw === 'string' ? { headline: raw } : raw;
  return {
    label: str(data.label),
    headline: str(data.headline),
    subtext: str(data.subtext),
    subtext2: str(data.subtext2),
  };
}

/**
 * Generate a full slider deck (cover + 1–3 content slides + closing slide)
 * for a chat request. Throws on generation failure — the caller surfaces the
 * error through the regular sharepic SSE error path.
 */
export async function generateSliderDeckForChat(
  req: Request,
  args: { thema: string; details?: string }
): Promise<{ slides: SliderSlide[] }> {
  const sharepicReq = req as SharepicRequest;
  const contentSlides = await analyzeSlideCount(sharepicReq, args.thema, args.details ?? '');
  const count = contentSlides + 2;

  log.info(`[SliderGeneration] Generating ${count} slides for "${args.thema.slice(0, 60)}"`);

  const result = await generateUnifiedTexts(sharepicReq, 'slider', {
    thema: args.thema,
    details: args.details ?? '',
    count,
  });

  if (!result.success) {
    throw new Error(`Slider-Generierung fehlgeschlagen: ${result.error}`);
  }

  const slides = [result.main, ...result.alternatives].map(toSlide);
  if (slides.length < 2 || !slides[0].headline) {
    throw new Error(`Slider-Generierung lieferte zu wenig Folien (${slides.length})`);
  }
  return { slides };
}

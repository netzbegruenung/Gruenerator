/**
 * Slider deck creation for the chat: generate slide texts, mint a multi-page
 * canvas document right away (unlike single sharepics, decks need their
 * server-seeded pages for studio open, editing and versions), and return the
 * variant payload for the chat card.
 */
import { randomUUID } from 'crypto';

import { getSharepicTemplateDescriptor } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { createCanvas } from '../../../services/canvas/canvasRepository.js';
import {
  applyDeckChanges,
  type CanvasPageDef,
} from '../../../services/canvas/canvasStateService.js';
import { insertCanvasVersion } from '../../../services/canvas/canvasVersionRepository.js';
import {
  generateSliderDeckForChat,
  type SliderSlide,
} from '../../../services/chat/sliderGenerationService.js';
import { createLogger } from '../../../utils/logger.js';

import { extractSharepicTopic, type SharepicVariant } from './sharepicVariantHelpers.js';

import type { Request } from 'express';

const log = createLogger('SliderDeck');

const DEFAULT_SCHEME = 'sand-tanne';

/** Map generated slide texts to page defs (partial props, like the studio seeds). */
export function slidesToPages(slides: SliderSlide[]): CanvasPageDef[] {
  const descriptor = getSharepicTemplateDescriptor('slider');
  const background = descriptor?.deck?.schemeColors[DEFAULT_SCHEME]?.background;
  return slides.map((slide, i) => ({
    id: randomUUID(),
    configId: 'slider',
    state: {
      label: i === 0 ? slide.label || 'Wusstest du?' : slide.label,
      headline: slide.headline,
      subtext: slide.subtext,
      subtext2: slide.subtext2,
      slideVariant: i === 0 ? 'cover' : i === slides.length - 1 ? 'last' : 'content',
      colorScheme: DEFAULT_SCHEME,
      ...(background ? { backgroundColor: background } : {}),
    },
  }));
}

export async function generateSliderDeckVariant(args: {
  req: Request;
  text: string;
  threadId: string | null;
  userId: string;
}): Promise<SharepicVariant> {
  const { req, text, threadId, userId } = args;
  const thema = extractSharepicTopic(text) || text;

  const { slides } = await generateSliderDeckForChat(req, { thema });
  const pages = slidesToPages(slides);
  const variantId = randomUUID();

  const title = slides[0].headline.slice(0, 80) || 'Slider-Karussell';
  const canvas = await createCanvas(userId, {
    title,
    template_type: 'slider',
    // Flat cover keys alongside `pages` keep gallery/thumbnail readers and
    // the Hocuspocus-down fallback rendering something.
    initial_state: { ...pages[0].state, pages },
    page_count: pages.length,
  });

  try {
    await applyDeckChanges(canvas.id, { seedPages: pages, newPages: pages });
  } catch (err) {
    // Tolerated: applyDeckChanges always re-sends seedPages, so the first
    // edit re-seeds a deck whose mint happened while Hocuspocus was down.
    log.warn(`[SliderDeck] Seeding ${canvas.id} failed (retried on first edit): ${err}`);
  }

  if (threadId) {
    const pg = getPostgresInstance();
    await pg.query(
      `INSERT INTO chat_thread_canvases (thread_id, variant_id, canvas_id, canvas_type, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (thread_id, variant_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP`,
      [threadId, variantId, canvas.id, 'slider']
    );
  }

  await insertCanvasVersion({
    canvasId: canvas.id,
    state: { pages },
    summary: 'Aus dem Chat erstellt',
    origin: 'mint',
    userId,
  });

  log.info(`[SliderDeck] Minted deck ${canvas.id} (${pages.length} slides) for "${title}"`);

  return {
    id: variantId,
    canvasType: 'slider',
    canvasId: canvas.id,
    initialProps: pages[0].state,
    pages: pages.map((p) => p.state),
    label: 'Slider',
  };
}

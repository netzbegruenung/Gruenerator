/**
 * Picks the style and the format of a new AI image from the request itself, so the
 * person only types what they want. One forced tool call on the same Gemma host as the
 * box planner; anything that goes wrong falls back to the defaults (realistic, 4:5)
 * rather than failing the image.
 */
import {
  DEFAULT_IMAGE_FORMAT,
  DEFAULT_STYLE_VARIANT,
  IMAGE_FORMAT_IDS,
} from '@gruenerator/shared/image-studio';

import { createLogger } from '../../utils/logger.js';
import { GEMMA_31B_ON_MELIOUS } from '../ai/gemmaHosts.js';
import { aiObject } from '../ai/generate.js';

import type { StructuredValidation } from '../ai/structuredParsing.js';
import type { ImageFormatId } from '@gruenerator/contracts';

const log = createLogger('imageSetup');

export const IMAGE_STYLES = [
  'realistic-pure',
  'illustration-pure',
  'pixel-pure',
  'editorial-pure',
] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number];

export interface ImageSetup {
  style: ImageStyle;
  format: ImageFormatId;
}

export const DEFAULT_IMAGE_SETUP: ImageSetup = {
  style: DEFAULT_STYLE_VARIANT,
  format: DEFAULT_IMAGE_FORMAT,
};

/** Longer than this and the image is made with the defaults. */
const WAIT_MS = 8_000;

const SYSTEM = `You choose the style and the format of an AI image from the user's request (German or English). The user only types what they want; you decide the rest.

style:
- realistic-pure — photographic. THE DEFAULT: use it whenever the request does not clearly ask for another look, including for plain subjects ("Windrad", "Demo in Berlin", "Familie am Küchentisch").
- illustration-pure — only when drawn or painted work is asked for: Illustration, Zeichnung, gezeichnet, Aquarell, gemalt, Comic, Cartoon, Kinderbuch.
- pixel-pure — only for Pixel Art, 8-bit/16-bit, Retro-Videospiel look.
- editorial-pure — only for Editorial, Magazin, Studio-Porträt, Werbefotografie.

format (the image ratio, width:height):
- 4:5 — the default for a social post and for anything unspecific.
- 1:1 — square: Profilbild, Avatar, Icon, Logo, "quadratisch".
- 16:9 — wide: Banner, Header, Titelbild, YouTube, Thumbnail, Präsentation, Desktop-Hintergrund, Panorama, "Querformat".
- 9:16 — tall: Story, Reel, TikTok, Handy-Hintergrund, "Hochformat schmal".
- 4:3 — classic landscape: Foto im Querformat, Folie.
- 3:4 — classic portrait: Poster, Plakat, Hochformat.
A ratio named in the request ("im 16:9 Format") wins.`;

export function validateImageSetup(input: unknown): StructuredValidation<ImageSetup> {
  const { style, format } = (input ?? {}) as Record<string, unknown>;
  if (!(IMAGE_STYLES as readonly unknown[]).includes(style)) {
    return { ok: false, error: `style must be one of ${IMAGE_STYLES.join(', ')}` };
  }
  if (!(IMAGE_FORMAT_IDS as readonly unknown[]).includes(format)) {
    return { ok: false, error: `format must be one of ${IMAGE_FORMAT_IDS.join(', ')}` };
  }
  return { ok: true, value: { style: style as ImageStyle, format: format as ImageFormatId } };
}

export async function inferImageSetup(prompt: string): Promise<ImageSetup> {
  try {
    const result = await aiObject<ImageSetup>({
      lane: 'image_setup',
      pinned: { provider: GEMMA_31B_ON_MELIOUS.provider, model: GEMMA_31B_ON_MELIOUS.model },
      system: SYSTEM,
      prompt: `Request:\n${prompt}`,
      toolName: 'submit_setup',
      toolDescription: 'Submit the style and the format of the image.',
      schema: {
        type: 'object',
        properties: {
          style: { type: 'string', enum: [...IMAGE_STYLES] },
          format: { type: 'string', enum: [...IMAGE_FORMAT_IDS] },
        },
        required: ['style', 'format'],
      },
      validate: validateImageSetup,
      temperature: 0,
      attempts: 1,
      timeoutMs: WAIT_MS,
      label: 'imageSetup',
    });
    if (result.ok) return result.data;
    log.warn(`[imageSetup] Falling back to the defaults: ${result.error}`);
  } catch (error) {
    log.warn('[imageSetup] Falling back to the defaults:', error);
  }
  return DEFAULT_IMAGE_SETUP;
}

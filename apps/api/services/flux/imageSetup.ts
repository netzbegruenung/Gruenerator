/**
 * Picks the style and the format of a new AI image from the request itself, so the
 * person only types what they want, and tells a request to edit a photo that never came
 * along ("bearbeite ein Bild von mir") from a description of a new image. One forced tool call on the same Gemma host as the
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

/** `edit_photo`: the request is to change an existing photo, not to describe a new image. */
export const IMAGE_REQUESTS = ['new_image', 'edit_photo'] as const;
export type ImageRequest = (typeof IMAGE_REQUESTS)[number];

export interface ImageSetup {
  style: ImageStyle;
  format: ImageFormatId;
  request: ImageRequest;
}

export const DEFAULT_IMAGE_SETUP: ImageSetup = {
  style: DEFAULT_STYLE_VARIANT,
  format: DEFAULT_IMAGE_FORMAT,
  request: 'new_image',
};

/** Longer than this and the image is made with the defaults. */
const WAIT_MS = 8_000;

const SYSTEM = `You choose the style and the format of an AI image from the user's request (German or English). The user only types what they want; you decide the rest. You also tell whether the request is for a new image at all.

request:
- new_image — THE DEFAULT: the request says what a new image should show, however short or vague ("Windrad", "Bild von einer Demo", "ich hätte gern ein Foto vom Rathaus").
- edit_photo — only when the user wants an existing photo or picture changed and none comes with the request: "ich möchte, dass du ein Bild von mir bearbeitest", "bearbeite mein Foto", "kannst du den Hintergrund von meinem Bild entfernen", "mach mein Profilbild heller". Such a request does not describe anything to paint.

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
  const { style, format, request } = (input ?? {}) as Record<string, unknown>;
  if (!(IMAGE_STYLES as readonly unknown[]).includes(style)) {
    return { ok: false, error: `style must be one of ${IMAGE_STYLES.join(', ')}` };
  }
  if (!(IMAGE_FORMAT_IDS as readonly unknown[]).includes(format)) {
    return { ok: false, error: `format must be one of ${IMAGE_FORMAT_IDS.join(', ')}` };
  }
  // A missing or unknown `request` is read as a new image — the field must not cost the style.
  const kind: ImageRequest = request === 'edit_photo' ? 'edit_photo' : 'new_image';
  return {
    ok: true,
    value: { style: style as ImageStyle, format: format as ImageFormatId, request: kind },
  };
}

export async function inferImageSetup(prompt: string): Promise<ImageSetup> {
  try {
    const result = await aiObject<ImageSetup>({
      lane: 'image_setup',
      pinned: { provider: GEMMA_31B_ON_MELIOUS.provider, model: GEMMA_31B_ON_MELIOUS.model },
      system: SYSTEM,
      prompt: `Request:\n${prompt}`,
      toolName: 'submit_setup',
      toolDescription: 'Submit the kind of request, the style and the format of the image.',
      schema: {
        type: 'object',
        properties: {
          style: { type: 'string', enum: [...IMAGE_STYLES] },
          format: { type: 'string', enum: [...IMAGE_FORMAT_IDS] },
          request: { type: 'string', enum: [...IMAGE_REQUESTS] },
        },
        required: ['request', 'style', 'format'],
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

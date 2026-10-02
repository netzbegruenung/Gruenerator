/**
 * Model-drafted bounding boxes for FLUX 3 (experimental).
 *
 * Three steps, each one forced tool call checked by the validators in
 * `flux3Boxes.ts` (a rejection goes back to the model as a repair turn):
 *  - `planLayout`: a short idea → caption + element table for text-to-image;
 *  - `detectElements`: an image → its elements with boxes, as the starting
 *    table for an edit (the UI box editor shows exactly these);
 *  - `planBoxEdit`: elements + instruction → keep/move/new/remove rows.
 *
 * Pinned to Gemma 4 on Melious, past the lane table: it is the only Gemma host
 * that takes images (measured 02.10.2026 — all three flavors answered an image
 * turn with 200, and the moth boxes landed within ~15 grid units of BFL's own
 * reference boxes; `modelDiscovery.ts` still records the 400 from 23.09.).
 * The text-only layout step uses the same host so all three speak one model.
 */
import sharp from 'sharp';

import { GEMMA_31B_ON_MELIOUS } from '../ai/gemmaHosts.js';
import { aiObject } from '../ai/generate.js';

import { validateBoxEdit, validateElements, validateLayout } from './flux3Boxes.js';

import type { ReferenceImage } from './FluxImageService.js';
import type { Flux3BoxEdit, Flux3Layout, Flux3LayoutRow } from '@gruenerator/contracts';

const PINNED = { provider: GEMMA_31B_ON_MELIOUS.provider, model: GEMMA_31B_ON_MELIOUS.model };

const GRID = `Coordinates: every box is [top, left, bottom, right] in integers from 0 to 1000, relative to the image — y comes FIRST. [0, 0, 500, 500] is the top-left quarter. The grid stretches with the frame: on a 4:5 image a square needs a box 125 units tall for every 100 units wide.`;

const BBOX_SCHEMA = { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 };
const NULLABLE_BBOX_SCHEMA = { type: ['array', 'null'], items: { type: 'integer' } };

const LAYOUT_SYSTEM = `You plan the layout of an image for an image model that places every element in its own box.

Write:
1. caption — one English paragraph about the whole image. Start with medium, setting and light, then introduce the elements and how they relate. Put each element's id in angle brackets right next to it, e.g. "a woman <person_1> sits in the left foreground". Describe positions in words as well.
2. rows — one row per id: { id, bbox, desc }. desc says what the element looks like (material, colour, pose, detail). Ids are short lowercase names with a number: person_1, sky_1, title_1.

Text: every line of text gets its own row. Quote the exact words in desc, keep their original language and spelling, and give case, colour, type style and alignment, e.g. Centered text reading "KLIMA JETZT" in bold white uppercase sans-serif.

${GRID}
A background may cover the full frame [0, 0, 1000, 1000]. Overlap boxes where objects overlap. Give every box at least 40 units on each side — smaller elements do not appear.`;

export async function planLayout(idea: string, aspectRatio: string): Promise<Flux3Layout | null> {
  const result = await aiObject<Flux3Layout>({
    lane: 'flux3_layout',
    pinned: PINNED,
    system: LAYOUT_SYSTEM,
    prompt: `Aspect ratio: ${aspectRatio}\n\nIdea:\n${idea}`,
    toolName: 'submit_layout',
    toolDescription: 'Submit the caption and the element table for the image.',
    schema: {
      type: 'object',
      properties: {
        caption: { type: 'string' },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, bbox: BBOX_SCHEMA, desc: { type: 'string' } },
            required: ['id', 'bbox', 'desc'],
          },
        },
      },
      required: ['caption', 'rows'],
    },
    validate: validateLayout,
    label: 'flux3Layout',
  });
  return result.ok ? result.data : null;
}

/** Gemma sees the image downscaled — boxes are relative, so detail is all it costs. */
async function visionInput(image: ReferenceImage): Promise<string> {
  const buffer = await sharp(image.buffer)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return buffer.toString('base64');
}

const DETECT_SYSTEM = `You list the visible elements of an image so an editor can change them box by box.

Return every distinct element a person might want to change: people, animals, objects, each line of text, and the larger background regions (sky, ground, wall). Group a dense crowd or a pile of small things into one element.
Per element: id (short lowercase name with a number: person_1, text_1, sky_1), bbox, desc (one sentence in English on what it looks like; for text, the exact words in quotes).

${GRID}`;

export async function detectElements(image: ReferenceImage): Promise<Flux3LayoutRow[] | null> {
  const result = await aiObject<Flux3LayoutRow[]>({
    lane: 'flux3_detect',
    pinned: PINNED,
    system: DETECT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { data: await visionInput(image), media_type: 'image/jpeg' } },
          { type: 'text', text: 'List the elements of this image.' },
        ],
      },
    ],
    toolName: 'submit_elements',
    toolDescription: 'Submit the elements of the image with their boxes.',
    schema: {
      type: 'object',
      properties: {
        elements: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, bbox: BBOX_SCHEMA, desc: { type: 'string' } },
            required: ['id', 'bbox', 'desc'],
          },
        },
      },
      required: ['elements'],
    },
    validate: validateElements,
    label: 'flux3Detect',
  });
  return result.ok ? result.data : null;
}

const EDIT_SYSTEM = `You turn an edit request into box-by-box instructions for an image model. The source image is <ref_image_0>; you get the image and the table of its elements.

Return:
1. instruction — one English paragraph: what changes, naming each changed element as <id>, and that everything else stays exactly unchanged (name the important kept elements as <id> too).
2. rows — one row per element, every element of the table plus any new one:
   - keep:   {"from": "ref_image_0", "src_bbox": B, "tgt_bbox": B (the same box), "desc": its current look}
   - move:   {"from": "ref_image_0", "src_bbox": where it is, "tgt_bbox": where it goes, "desc": its look}
   - change or add (recolor, replace, new object): {"from": null, "src_bbox": null, "tgt_bbox": its box, "desc": what it should look like AFTER the edit}
   - remove: {"from": "ref_image_0", "src_bbox": its box, "tgt_bbox": null, "desc": what it is}
   State additions and removals in the instruction as well as in the rows.

${GRID}`;

export async function planBoxEdit(
  instruction: string,
  image: ReferenceImage,
  elements: Flux3LayoutRow[]
): Promise<Flux3BoxEdit | null> {
  const result = await aiObject<Flux3BoxEdit>({
    lane: 'flux3_box_edit',
    pinned: PINNED,
    system: EDIT_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { data: await visionInput(image), media_type: 'image/jpeg' } },
          {
            type: 'text',
            text: `Elements:\n${JSON.stringify(elements)}\n\nEdit request (may be German):\n${instruction}`,
          },
        ],
      },
    ],
    toolName: 'submit_box_edit',
    toolDescription: 'Submit the edit instruction and one row per element.',
    schema: {
      type: 'object',
      properties: {
        instruction: { type: 'string' },
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              from: { type: ['string', 'null'] },
              src_bbox: NULLABLE_BBOX_SCHEMA,
              tgt_bbox: NULLABLE_BBOX_SCHEMA,
              desc: { type: 'string' },
            },
            required: ['id', 'from', 'src_bbox', 'tgt_bbox', 'desc'],
          },
        },
      },
      required: ['instruction', 'rows'],
    },
    validate: validateBoxEdit,
    label: 'flux3BoxEdit',
  });
  return result.ok ? result.data : null;
}

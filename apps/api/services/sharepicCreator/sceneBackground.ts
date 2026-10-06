/**
 * A painted background for the sharepic creator: FLUX 3 paints only the scene
 * and leaves the side the text goes on calm; the creator sets headline,
 * diagram and label on top as real layers (see `flux3-layout-canvas`: FLUX
 * never sets CD text). The image goes into the user's media library, and the
 * spec carries it as `ki:<shareToken>`.
 */
import fs from 'node:fs';

import {
  type Flux3Bbox,
  type Flux3Layout,
  type SharepicFormat,
  type SharepicTextSide,
} from '@gruenerator/contracts';
import { IMAGE_MODEL_BY_ID } from '@gruenerator/shared/models';

import { createLogger } from '../../utils/logger.js';
import { serializeLayout } from '../flux/flux3Boxes.js';
import { FluxImageService } from '../flux/index.js';
import { getSharedMediaService } from '../sharedMediaService.js';
import { getTreeBudget, treeBudgetSpentMessage, treeCostForImage } from '../trees/index.js';

const log = createLogger('sharepicCreator:scene');

/** FLUX 3 at 1k: a feed post needs no more, and it costs one image. */
const SCENE_MODEL = IMAGE_MODEL_BY_ID['flux-pro'];

export interface SceneRequest {
  /** English scene description, written by the draft model — never text or numbers. */
  motiv: string;
  textSeite: SharepicTextSide;
  format: SharepicFormat | undefined;
}

export type SceneResult = { ok: true; ref: string } | { ok: false; hinweis: string };
export type ScenePainter = (scene: SceneRequest) => Promise<SceneResult>;

/**
 * The calm area on the 0–1000 grid, `[top, left, bottom, right]`. Mirrors the
 * composer: a side column is 52 % wide plus the 6.5 % margin, a text block at
 * the top or bottom with its scrim takes up to 62 % (the share `photoTone`
 * measures).
 */
export function calmBox(textSeite: SharepicTextSide): Flux3Bbox {
  switch (textSeite) {
    case 'unten':
      return [380, 0, 1000, 1000];
    case 'oben':
      return [0, 0, 620, 1000];
    case 'links':
      return [0, 0, 1000, 590];
    case 'rechts':
      return [0, 410, 1000, 1000];
  }
}

/** The rest of the frame, where the subject goes. */
function subjectBox(textSeite: SharepicTextSide): Flux3Bbox {
  switch (textSeite) {
    case 'unten':
      return [0, 0, 380, 1000];
    case 'oben':
      return [620, 0, 1000, 1000];
    case 'links':
      return [0, 590, 1000, 1000];
    case 'rechts':
      return [0, 0, 1000, 410];
  }
}

export function sceneLayout(motiv: string, textSeite: SharepicTextSide): Flux3Layout {
  return {
    caption:
      `${motiv.trim()} The subject <motiv> fills its area; <ruhe> continues the same scene calm, softly out of focus and evenly lit, without people or objects. ` +
      'Photorealistic editorial photo, natural light. No text, letters, numbers, signs, labels or arrows anywhere.',
    rows: [
      { id: 'motiv', bbox: subjectBox(textSeite), desc: motiv.trim() },
      {
        id: 'ruhe',
        bbox: calmBox(textSeite),
        desc: 'calm, out of focus continuation of the scene, no people, no objects, no text',
      },
    ],
  };
}

const FALLBACK =
  'Der Hintergrund ließ sich nicht malen – das Sharepic steht auf einer Markenfarbe.';

export function createScenePainter(userId: string): ScenePainter {
  return async ({ motiv, textSeite, format }) => {
    const cost = treeCostForImage(SCENE_MODEL.costMultiplier);
    const budget = getTreeBudget();
    const reservation = await budget.reserve(userId, cost);
    if (!reservation.ok) {
      return {
        ok: false,
        hinweis:
          reservation.reason === 'unavailable'
            ? FALLBACK
            : `${treeBudgetSpentMessage(reservation.status, cost)} Das Sharepic steht deshalb auf einer Markenfarbe statt auf einem gemalten Hintergrund.`.slice(
                0,
                300
              ),
      };
    }
    try {
      const flux = await FluxImageService.create(
        SCENE_MODEL.backend,
        SCENE_MODEL.modelPath,
        SCENE_MODEL.resolution
      );
      const { stored } = await flux.generateFromPrompt(
        serializeLayout(sceneLayout(motiv, textSeite)),
        { aspect_ratio: format === 'post-portrait-tall' ? '3:4' : '4:5' }
      );
      const share = await getSharedMediaService().uploadMediaFile(userId, {
        fileBuffer: fs.readFileSync(stored.filePath),
        originalFilename: 'sharepic-hintergrund.jpg',
        mimeType: 'image/jpeg',
        title: 'Sharepic-Hintergrund (KI)',
        altText: motiv.slice(0, 300),
        uploadSource: 'ai_generated',
      });
      return { ok: true, ref: `ki:${share.shareToken}` };
    } catch (error) {
      log.warn(`scene failed: ${error instanceof Error ? error.message : String(error)}`);
      await budget.release(userId, cost, reservation.status.day);
      return { ok: false, hinweis: FALLBACK };
    }
  };
}

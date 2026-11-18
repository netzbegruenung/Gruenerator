/**
 * What the KI-Schnitt fills in by itself: the brief the page does not send,
 * and the tree reservation that every model-backed step books first.
 */
import { type VideoAiBrief, type VideoAiBriefInput } from '@gruenerator/contracts';

import { getTreeBudget, treeBudgetSpentMessage } from '../trees/index.js';

import { type StoredVideoAiInput } from './projectTypes.js';

/**
 * The page sends only files (like the reel Grünerator). Defaults: vertical
 * reel, the dynamic talking-head look, the first video's name as title.
 */
export function completeBrief(
  input: VideoAiBriefInput | null,
  inputs: readonly StoredVideoAiInput[]
): VideoAiBrief {
  const firstClip = inputs.find((i) => i.role === 'footage')?.title ?? '';
  const fromFile = firstClip
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .trim()
    .slice(0, 120);
  return {
    ...input,
    title: input?.title?.trim() || fromFile || 'KI-Schnitt',
    format: input?.format ?? '9:16',
    style: input?.style ?? 'talking-head-dynamisch',
  };
}

/** Books `units` for today; the caller releases them on `day` when the step fails. */
export async function reserveVideoAiTrees(
  userId: string,
  units: number
): Promise<{ ok: true; day: string } | { ok: false; status: 429 | 503; error: string }> {
  const reservation = await getTreeBudget().reserve(userId, units);
  if (reservation.ok) return { ok: true, day: reservation.status.day };
  return reservation.reason === 'exceeded'
    ? { ok: false, status: 429, error: treeBudgetSpentMessage(reservation.status, units) }
    : {
        ok: false,
        status: 503,
        error: 'Das Kontingent ist gerade nicht lesbar. Bitte versuch es gleich noch einmal.',
      };
}

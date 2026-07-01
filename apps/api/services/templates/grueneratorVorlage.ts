/**
 * Helpers for Grünerator-Vorlagen — native sharepic templates published into
 * the public gallery. A `user_templates` row with `template_type='gruenerator'`
 * is a thin bridge whose `content_data` ({ canvasId, canvasType, format })
 * points at a frozen snapshot canvas. Publishing clones the user's working
 * canvas into that snapshot; "using" a vorlage clones the snapshot again.
 */

import { GRUENERATOR_TEMPLATE_TYPE } from '@gruenerator/contracts';

import { createLogger } from '../../utils/logger.js';
import { deleteCanvas } from '../canvas/canvasRepository.js';

const log = createLogger('grueneratorVorlage');

/** Read the snapshot canvas id out of a stored `content_data` blob, if present. */
export function snapshotCanvasId(contentData: unknown): string | null {
  const id = (contentData as { canvasId?: unknown } | null | undefined)?.canvasId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Soft-delete the snapshot canvas backing a deleted Grünerator-Vorlage so frozen
 * snapshots don't leak. `ownerId` is the template's `user_id` (the snapshot's
 * creator), required by `deleteCanvas`'s owner check. No-op for non-gruenerator
 * rows. Best-effort: failures are logged, never thrown.
 */
export async function cleanupGrueneratorSnapshot(
  templateType: unknown,
  contentData: unknown,
  ownerId: string | null | undefined
): Promise<void> {
  if (templateType !== GRUENERATOR_TEMPLATE_TYPE || !ownerId) return;
  const canvasId = snapshotCanvasId(contentData);
  if (!canvasId) return;
  try {
    await deleteCanvas(canvasId, ownerId);
  } catch (err) {
    log.warn('[cleanupGrueneratorSnapshot] failed to delete snapshot canvas', err);
  }
}

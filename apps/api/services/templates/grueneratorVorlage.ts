/**
 * Helpers for Grünerator-Vorlagen — native sharepic templates published into
 * the public gallery. A `user_templates` row with `template_type='gruenerator'`
 * is a thin bridge whose `content_data` ({ canvasId, canvasType, format })
 * points at a frozen snapshot canvas. Publishing clones the user's working
 * canvas into that snapshot; "using" a vorlage clones the snapshot again.
 */

import { GRUENERATOR_TEMPLATE_TYPE } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { deleteCanvas } from '../canvas/canvasRepository.js';
import {
  purgeCollaborativeDocument,
  type QueryRunner,
} from '../docs/CollaborativeDocumentService.js';

const runQuery: QueryRunner = <T>(sql: string, params?: unknown[]) =>
  getPostgresInstance().query<T>(sql, params);

/** Read the snapshot canvas id out of a stored `content_data` blob, if present. */
export function snapshotCanvasId(contentData: unknown): string | null {
  const id = (contentData as { canvasId?: unknown } | null | undefined)?.canvasId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Hard-delete the snapshot canvas backing a purged Grünerator-Vorlage. The
 * snapshot is no library item of its own: it lives and dies with its Vorlage,
 * so trashing the Vorlage leaves it alone and only the purge removes it.
 * `ownerId` is the template's `user_id` (the snapshot's creator), required by
 * `deleteCanvas`'s owner check; the purge only takes a trashed row, hence the
 * trash step first (`not_found` there is a snapshot already trashed or gone).
 * No-op for non-gruenerator rows. Throws — the caller reports it as a side store.
 */
export async function purgeGrueneratorSnapshot(
  templateType: unknown,
  contentData: unknown,
  ownerId: string | null
): Promise<void> {
  if (templateType !== GRUENERATOR_TEMPLATE_TYPE || !ownerId) return;
  const canvasId = snapshotCanvasId(contentData);
  if (!canvasId) return;
  const trashed = await deleteCanvas(canvasId, ownerId);
  if (trashed.kind === 'forbidden') {
    throw new Error('Snapshot canvas is not owned by the Vorlage owner');
  }
  await purgeCollaborativeDocument(runQuery, canvasId, null);
}

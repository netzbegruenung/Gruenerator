/**
 * Sichtbarkeit eines Notebooks ändern — share_mode, edit_policy, Listung.
 *
 * Aus `notebookSharingContractRouter` herausgezogen, weil die Regeln dort in
 * drei Handlern verteilt lagen und der Chat (Karte `set_notebook_visibility`)
 * dieselben Regeln braucht. Zwei Invarianten, beide aus dem Router:
 *
 * - Eine Abstufung unter 'authenticated' löscht die Listung „Von der Basis":
 *   die Listenabfrage und `checkNotebookAccess` müssen im Gleichschritt
 *   bleiben, sonst steht ein Notebook in der Liste, das niemand öffnen darf
 *   (der ursprüngliche Orphan-Listing-Fehler).
 * - Gelistet wird nur mit `public_ownership` UND share_mode 'authenticated'.
 *   Beides darf im selben Patch kommen — die Karte schickt Stufe und Listung
 *   zusammen, wo das Modal zwei Requests macht.
 *
 * `planNotebookVisibility` ist rein und liefert das, was das Werkzeug VOR der
 * Karte prüfen kann; `applyNotebookVisibility` schreibt.
 */
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';

import type {
  NotebookCollection,
  NotebookCollectionData,
  NotebookEditPolicy,
  NotebookShareMode,
} from '../../database/services/NotebookQdrantHelper.js';
import type { PublicOwnership } from '@gruenerator/contracts';

export interface NotebookVisibilityPatch {
  share_mode?: NotebookShareMode;
  edit_policy?: NotebookEditPolicy;
  is_public?: boolean;
  public_ownership?: PublicOwnership | null;
}

type VisibilityUpdates = Pick<
  NotebookCollectionData,
  'share_mode' | 'edit_policy' | 'is_public' | 'public_ownership'
>;

export type VisibilityPlan =
  { ok: true; updates: VisibilityUpdates } | { ok: false; error: string };

export function planNotebookVisibility(
  collection: Pick<NotebookCollection, 'share_mode' | 'is_public'>,
  patch: NotebookVisibilityPatch
): VisibilityPlan {
  const updates: VisibilityUpdates = {};
  const nextMode = patch.share_mode ?? collection.share_mode;

  if (patch.share_mode !== undefined) {
    updates.share_mode = patch.share_mode;
    if (patch.share_mode !== 'authenticated' && collection.is_public === true) {
      updates.is_public = false;
      updates.public_ownership = null;
    }
  }
  if (patch.edit_policy !== undefined) updates.edit_policy = patch.edit_policy;

  if (patch.is_public === true) {
    if (!patch.public_ownership) {
      return {
        ok: false,
        error: 'Bitte bestätige die Quelle der Inhalte (Eigentum oder öffentlich).',
      };
    }
    if (nextMode !== 'authenticated') {
      return {
        ok: false,
        error:
          'Bitte zuerst Sichtbarkeit auf „Mit Anmeldung" setzen, dann auf Von der Basis listen.',
      };
    }
    updates.is_public = true;
    updates.public_ownership = patch.public_ownership;
  } else if (patch.is_public === false) {
    updates.is_public = false;
    updates.public_ownership = null;
  }

  return { ok: true, updates };
}

export type ApplyVisibilityResult =
  { ok: true } | { ok: false; status: 400 | 403 | 404; error: string };

type VisibilityHelper = Pick<
  NotebookQdrantHelper,
  'getNotebookCollection' | 'updateNotebookCollection'
>;

let helperSingleton: VisibilityHelper | null = null;

export async function applyNotebookVisibility(
  collectionId: string,
  userId: string,
  patch: NotebookVisibilityPatch,
  helper: VisibilityHelper = (helperSingleton ??= new NotebookQdrantHelper())
): Promise<ApplyVisibilityResult> {
  const collection = await helper.getNotebookCollection(collectionId);
  if (!collection) return { ok: false, status: 404, error: 'Notebook nicht gefunden' };
  if (collection.user_id !== userId) {
    return { ok: false, status: 403, error: 'Nur Eigentümer*in erlaubt' };
  }
  const plan = planNotebookVisibility(collection, patch);
  if (!plan.ok) return { ok: false, status: 400, error: plan.error };
  if (Object.keys(plan.updates).length === 0) return { ok: true };
  await helper.updateNotebookCollection(collectionId, plan.updates);
  return { ok: true };
}

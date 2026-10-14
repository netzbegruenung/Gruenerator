import fs from 'node:fs/promises';

import { createLogger } from '../../utils/logger.js';
import { purgeSideStore } from '../trash/ownedRowTrash.js';
import { getTreeBudget } from '../trees/index.js';

import {
  deleteTrashedExplainable,
  explainableImageDir,
  trashExplainableRow,
} from './explainableRepository.js';

const log = createLogger('explainableTrash');

/** Papierkorb + give back the units still reserved for undrawn images. */
export async function trashExplainable(userId: string, id: string): Promise<boolean> {
  const trashed = await trashExplainableRow(userId, id);
  if (!trashed) return false;
  if (trashed.reservedUnits > 0 && trashed.reservedDay) {
    try {
      await getTreeBudget().release(userId, trashed.reservedUnits, trashed.reservedDay);
    } catch (error) {
      log.warn(`Units for ${id} not released: ${(error as Error).message}`);
    }
  }
  return true;
}

export async function purgeExplainable(id: string, cutoff: Date | null): Promise<boolean> {
  const deleted = await deleteTrashedExplainable(id, cutoff);
  if (!deleted) return false;
  await purgeSideStore('explainable', id, 'images', () =>
    fs.rm(explainableImageDir(id), { recursive: true, force: true })
  );
  return true;
}

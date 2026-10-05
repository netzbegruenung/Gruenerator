/**
 * Ein DIP-Dokument (`DipParent`) über den geteilten Einheiten-Store schreiben.
 */
import {
  prepareParentPoints as prepareStorePoints,
  writeParent as writeStoreParent,
  type ParentDoc,
  type ParentStoreConfig,
  type PreparedPoint,
} from '../../utils/parentStore.js';

import { dipPointId, unitPayload, type DipParent } from './builders.js';

import type { QdrantClient } from '@qdrant/js-client-rest';

export { upsertBatches, type PreparedPoint } from '../../utils/parentStore.js';

export const DIP_COLLECTION = 'bundestag_dip_documents';

const DIP_STORE: ParentStoreConfig = {
  collection: DIP_COLLECTION,
  source: 'bundestag-dip',
  pointId: dipPointId,
  commitKeys: ['content_hash'],
};

function toParentDoc(parent: DipParent): ParentDoc {
  return {
    parentId: parent.parentId,
    units: parent.units.map((unit) => ({
      documentId: unit.documentId,
      title: unit.title,
      headingPath: unit.headingPath,
      text: unit.text,
      sourceUrl: unit.sourceUrl,
      payload: unitPayload(unit, parent),
    })),
  };
}

export function prepareParentPoints(parent: DipParent): Promise<PreparedPoint[]> {
  return prepareStorePoints(DIP_STORE, toParentDoc(parent));
}

export function writeParent(client: QdrantClient, parent: DipParent): Promise<number> {
  return writeStoreParent(client, DIP_STORE, toParentDoc(parent));
}

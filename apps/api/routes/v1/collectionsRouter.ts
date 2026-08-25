import { Router, type Request, type Response } from 'express';

import { NOTEBOOK_GATE } from '../../config/notebookCollectionMap.js';
import {
  getMcpExposedCollections,
  type FilterableField,
} from '../../config/systemCollectionsConfig.js';

// Public MCP collection catalog — the mcpExposed subset of SYSTEM_COLLECTIONS,
// fetched by the MCP at runtime.
export interface SerializedFilterableField {
  field: string;
  label: string;
  type: FilterableField['type'];
  valueLabels?: Record<string, string>;
}

export interface SerializedCollection {
  key: string;
  qdrantCollection: string;
  displayName: string;
  description: string;
  country?: 'DE' | 'AT';
  includeInDefaultSearch: boolean;
  defaultFilter?: { field: string; value: string | string[] };
  filterableFields: SerializedFilterableField[];
}

// Strips the -system id, backend tuning fields, and mcpHidden facets — and the
// collections this instance does not offer. Qdrant is shared across
// deployments, so without the gate this catalog would advertise a Landesverband
// collection that the same instance hides in every one of its own surfaces.
export function serializeMcpCatalog(): SerializedCollection[] {
  const offered = new Set(
    NOTEBOOK_GATE.dropHiddenCollections(getMcpExposedCollections().map((c) => c.key))
  );
  return getMcpExposedCollections()
    .filter((c) => offered.has(c.key))
    .map((c) => ({
      key: c.key,
      qdrantCollection: c.qdrantCollection,
      displayName: c.name,
      description: c.description,
      ...(c.country ? { country: c.country } : {}),
      includeInDefaultSearch: c.includeInDefaultSearch ?? false,
      ...(c.defaultFilter ? { defaultFilter: c.defaultFilter } : {}),
      filterableFields: c.filterableFields
        .filter((f) => !f.mcpHidden)
        .map((f) => ({
          field: f.field,
          label: f.label,
          type: f.type,
          ...(f.valueLabels ? { valueLabels: f.valueLabels } : {}),
        })),
    }));
}

const router: Router = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({ collections: serializeMcpCatalog() });
});

export default router;

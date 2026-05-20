import { SYSTEM_COLLECTIONS } from '../../config/systemCollectionsConfig.js';

/**
 * Map a Landesverband short code (e.g. 'HH', 'BY') to the canonical
 * system-collection id used by NotebookQAService.
 *
 * Derived live from SYSTEM_COLLECTIONS so adding a new LV system collection
 * automatically becomes queryable through /api/v1/notebooks.
 */
export function getSystemCollectionIdForLandesverband(lv: string): string | null {
  for (const config of Object.values(SYSTEM_COLLECTIONS)) {
    const f = config.defaultFilter;
    if (!f || f.field !== 'landesverband') continue;
    const values = Array.isArray(f.value) ? f.value : [f.value];
    if (values.includes(lv)) return config.id;
  }
  return null;
}

export function listSupportedLandesverbaende(): Array<{
  code: string;
  collectionId: string;
  name: string;
}> {
  const out: Array<{ code: string; collectionId: string; name: string }> = [];
  for (const config of Object.values(SYSTEM_COLLECTIONS)) {
    const f = config.defaultFilter;
    if (!f || f.field !== 'landesverband') continue;
    const values = Array.isArray(f.value) ? f.value : [f.value];
    for (const v of values) {
      out.push({ code: v, collectionId: config.id, name: config.name });
    }
  }
  return out;
}

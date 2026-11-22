/**
 * `source_type` der Qdrant-Punkte, die aus kollaborativen Dokumenten stammen
 * (`services/docs/collabSearchIndex.ts`). Sie liegen in der Sammlung `documents`
 * neben den Uploads, sind aber NUR über eine Dokument-ID erreichbar: die
 * ungescopten Suchen (`searchOperations.ts`, `searchUserDocuments`) schliessen
 * sie aus.
 */
export const COLLAB_SOURCE_TYPE = 'collab';

/** `must_not`-Klausel, die Collab-Punkte aus ungescopten Suchen ausschliesst. */
export const EXCLUDE_COLLAB_SOURCE = {
  key: 'source_type',
  match: { value: COLLAB_SOURCE_TYPE },
} as const;

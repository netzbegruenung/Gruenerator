/**
 * „Mit dir geteilt" — die Notebooks, die andere in ein Projekt geteilt haben,
 * dem die Person angehört.
 *
 * Drei Aufrufer stellen dieselbe Frage: die Wissen-Kachel
 * (`listSharedCollections`), der @-Erwähnungs-Picker im Chat (derselbe
 * Endpunkt) und das `notebooks`-Werkzeug mit `scope: 'shared'`.
 *
 * Bewusst NUR über Projekt-Mitgliedschaft. Die frühere
 * `listAccessibleCollections` nahm zusätzlich jedes `share_mode='authenticated'`-
 * Notebook mit — das sind alle, die irgendwer per Link lesbar gemacht hat, und
 * landete bei allen Nutzer*innen in „Eigene". Wer hier ein Notebook sieht, hat
 * eine Mitgliedschaft in einem Projekt, in das es geteilt wurde.
 *
 * Der Filter läuft im Gleichschritt mit `checkNotebookAccess`: eine
 * Freigabe-Zeile auf einem `private`-Notebook ist dort nicht lesbar, also wird
 * sie hier auch nicht gelistet. Das Öffnen prüft `checkNotebookAccess` weiter.
 */
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';

import type { NotebookCollection } from '../../database/services/NotebookQdrantHelper.js';

export type GroupSharedNotebook = NotebookCollection & { shared_via_groups: string[] };

interface ShareRow {
  content_id: string;
  group_names: string[];
  [key: string]: unknown;
}

export interface GroupSharedNotebookListingDeps {
  query: (sql: string, params: unknown[]) => Promise<ShareRow[]>;
  helper: Pick<NotebookQdrantHelper, 'getNotebookCollectionsByIds'>;
}

let helperSingleton: NotebookQdrantHelper | null = null;

function defaultDeps(): GroupSharedNotebookListingDeps {
  return {
    query: (sql, params) => getPostgresInstance().query(sql, params) as Promise<ShareRow[]>,
    helper: (helperSingleton ??= new NotebookQdrantHelper()),
  };
}

const READABLE_SHARE_MODES = new Set(['groups', 'authenticated']);

export async function listGroupSharedNotebooksForUser(
  userId: string,
  deps: GroupSharedNotebookListingDeps = defaultDeps()
): Promise<GroupSharedNotebook[]> {
  const rows = await deps.query(
    `SELECT gcs.content_id, array_agg(DISTINCT g.name ORDER BY g.name) AS group_names
       FROM group_content_shares gcs
       INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id AND gm.user_id = $1
       INNER JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
       WHERE gcs.content_type = 'notebook_collections'
       GROUP BY gcs.content_id`,
    [userId]
  );
  if (rows.length === 0) return [];

  const groupsById = new Map(rows.map((r) => [r.content_id, r.group_names]));
  const collections = await deps.helper.getNotebookCollectionsByIds([...groupsById.keys()]);

  return collections
    .filter((c) => c.user_id !== userId && READABLE_SHARE_MODES.has(c.share_mode ?? ''))
    .map((c) => ({ ...c, shared_via_groups: groupsById.get(c.id) ?? [] }));
}

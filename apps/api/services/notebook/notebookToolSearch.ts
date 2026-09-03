/**
 * Ein Notebook inhaltlich befragen — der Körper des `notebooks`-Werkzeugs
 * (Aktion `search`), für Chat und MCP.
 *
 * Bis 09/2026 lebte das als Override NUR im MCP-Server (`serverFactory.ts`):
 * ein externer Client konnte ein Notebook befragen, der eigene Chat nicht.
 * Hier liegt der gemeinsame Kern; die Aufrufer unterscheiden sich nur darin,
 * was sie mit der Antwort tun — der Chat registriert die Zitate im
 * `sourceRegistry`, MCP rendert Markdown (`renderNotebookAnswer`).
 *
 * Die Zugriffsprüfung passiert IM Dienst (`checkNotebookAccess` in
 * `askSingleCollection`): Owner, share_mode='authenticated' oder Mitglied
 * einer geteilten Gruppe. Deshalb wird die Sammlung hier nur geholt, nicht
 * gegen `user_id` verglichen.
 */
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';

import { notebookQAService } from './NotebookQAService.js';

import type { QAResponse } from './types.js';

/**
 * `askSingleCollection` meldet diese zwei Zustände durch Werfen. Für einen
 * Werkzeugaufruf sind das gewöhnliche Ergebnisse, keine Ausfälle — sie
 * bekommen deutschen Text statt einer generischen Fehlermeldung.
 */
const NOTEBOOK_QA_ERRORS: Record<string, string> = {
  'Collection not found or access denied': 'Notebook nicht gefunden oder kein Zugriff.',
  'No documents found in this collection': 'Dieses Notebook enthält noch keine Dokumente.',
};

export interface NotebookSearchInput {
  collectionId: string;
  query: string;
  userId: string;
}

export type NotebookSearchOutcome =
  { ok: true; notebookName: string; result: QAResponse } | { ok: false; error: string };

export interface NotebookSearchDeps {
  helper: Pick<NotebookQdrantHelper, 'getNotebookCollection' | 'getCollectionDocuments'>;
  qa: Pick<typeof notebookQAService, 'askSingleCollection'>;
}

let helperSingleton: NotebookQdrantHelper | null = null;

function defaultDeps(): NotebookSearchDeps {
  return { helper: (helperSingleton ??= new NotebookQdrantHelper()), qa: notebookQAService };
}

export async function runNotebookSearch(
  input: NotebookSearchInput,
  deps: NotebookSearchDeps = defaultDeps()
): Promise<NotebookSearchOutcome> {
  const query = input.query.trim();
  if (!input.collectionId || !query) {
    return { ok: false, error: 'search braucht id (aus list) und query.' };
  }
  const collection = await deps.helper.getNotebookCollection(input.collectionId);
  if (!collection)
    return { ok: false, error: NOTEBOOK_QA_ERRORS['Collection not found or access denied'] };
  try {
    const result = await deps.qa.askSingleCollection({
      collectionId: input.collectionId,
      question: query,
      userId: input.userId,
      // Beide sind für Nutzer-Sammlungen PFLICHT — der Dienst wirft sonst.
      // Die schon geholte Zeile durchzureichen spiegelt notebookContractRouter
      // und überlässt die Zugriffsentscheidung `checkNotebookAccess` im Dienst.
      getCollectionFn: async () => collection,
      getDocumentIdsFn: async (cid) =>
        (await deps.helper.getCollectionDocuments(cid)).map((d) => d.document_id),
    });
    return { ok: true, notebookName: collection.name, result };
  } catch (err) {
    const mapped = NOTEBOOK_QA_ERRORS[(err as Error).message];
    if (mapped) return { ok: false, error: mapped };
    throw err;
  }
}

/**
 * Die „Öffentlich"-Auswahl — welche öffentlich gelisteten Notebooks eine
 * Person überhaupt sehen darf.
 *
 * Herausgezogen aus `notebookCollectionsContractRouter.listPublicCollections`,
 * weil seit 09/2026 ein zweiter Aufrufer dieselbe Frage stellt: das
 * `notebooks`-Werkzeug mit `scope: 'basis'`. Geteilt wird bewusst nur die
 * AUSWAHL, nicht die Anreicherung — der Router baut daraus eine
 * Contract-Antwort mit Dokumenten, Wolke-Links und Like-Zahlen, das Werkzeug
 * braucht nur Name, Beschreibung und Urheber*in.
 *
 * Die Audience-Regel ist der Grund für die Extraktion: sie ist der einzige
 * Filter, der hier Politik ist und nicht Darstellung. Ein DE-Notebook darf in
 * der österreichischen Ansicht nicht auftauchen und umgekehrt — exakte
 * Gleichheit, dieselbe Regel wie bei der `authenticated`-Listung. Läge sie an
 * zwei Stellen, würde genau eine davon beim nächsten Umbau vergessen.
 *
 * `is_public` ist ein ENTDECKUNGS-Merkmal, kein Zugriffsrecht: wer ein hier
 * gelistetes Notebook öffnet, wird weiterhin von `checkNotebookAccess`
 * geprüft.
 */
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';

import type { UserLocale } from '../../agents/langgraph/ChatGraph/types.js';
import type { NotebookCollection } from '../../database/services/NotebookQdrantHelper.js';

export interface PublicNotebookListingDeps {
  helper: Pick<NotebookQdrantHelper, 'getPublicNotebookCollections'>;
}

let helperSingleton: NotebookQdrantHelper | null = null;

function defaultDeps(): PublicNotebookListingDeps {
  return { helper: (helperSingleton ??= new NotebookQdrantHelper()) };
}

/**
 * Alle `is_public`-Notebooks, die zur Locale der betrachtenden Person passen.
 *
 * Gelistet wird nur, was andere auch öffnen dürfen (`share_mode =
 * 'authenticated'` — `updateCollection` kann `is_public` an dieser Regel
 * vorbei setzen), was keine Meldung ausgeblendet hat und was einer Person
 * gehört: System-Notebooks stehen in ihrer eigenen Registry.
 *
 * Die Reihenfolge bleibt die des Helpers; Sortierung und Anreicherung sind
 * Sache der Aufrufer.
 */
export async function listPublicNotebooksForViewer(
  viewerLocale: UserLocale,
  deps: PublicNotebookListingDeps = defaultDeps()
): Promise<NotebookCollection[]> {
  const collections = await deps.helper.getPublicNotebookCollections();
  return collections.filter(
    (c) =>
      c.audience === viewerLocale &&
      c.share_mode === 'authenticated' &&
      c.moderation === 'ok' &&
      c.user_id !== 'SYSTEM'
  );
}

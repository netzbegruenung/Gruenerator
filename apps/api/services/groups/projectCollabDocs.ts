/**
 * Die Docs, Präsentationen, Tabellen und Boards eines Projekts — als Titelliste
 * im Prompt seiner Chats, nicht als Inhalt.
 *
 * Kollaborative Dokumente sind nicht in Qdrant indexiert; ihr Text liegt in
 * Yjs. Ihn bei jedem Turn mitzuschicken kostete rund 8k Token auch dort, wo die
 * Frage kein Dokument braucht. Stattdessen sieht das Modell nur Titel, Art und
 * id (ein paar Dutzend Token) und liest bei Bedarf mit `read_artifact`
 * (`personalDataTools.ts`) — dessen Lader prüfen den Zugriff je Aufruf selbst.
 * Die ids kommen ausschliesslich aus dieser Abfrage, nie aus dem Modell.
 *
 * Zugriffsregel in der Abfrage: aktive Mitgliedschaft im Projekt des Threads,
 * eigener Thread oder Team-Chat (`projectThreadScopeSql`); getrashte Dokumente
 * fallen heraus (`deleted_at` UND `is_deleted`, siehe CLAUDE.md „Papierkorb").
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { embedUntrusted } from '../../routes/chat/services/untrustedContent.js';

import { projectThreadScopeSql } from './projectThreadScope.js';

/**
 * Wie viele Titel der Prompt höchstens nennt: je Zeile rund 25 Token, also gut
 * 500 Token im Vollausbau. Mehr findet das Modell über `find_content`.
 */
export const PROJECT_COLLAB_DOC_CAP = 20;

const TITLE_MAX_CHARS = 80;

/** Art, wie `read_artifact` sie als `kind` nimmt. */
export type ProjectCollabReadKind = 'doc' | 'sheet' | 'board' | 'presentation';

export interface ProjectCollabDoc {
  id: string;
  title: string;
  kind: ProjectCollabReadKind;
}

/** Welche Arten gelistet werden — `video` hat keinen Text. */
const LISTED_SUBTYPES = [
  'blank',
  'docs',
  'antrag',
  'pressemitteilung',
  'protokoll',
  'notizen',
  'redaktionsplan',
  'checkliste',
  'einladung',
  'tabelle',
  'canvas',
  'presentations',
  'sheets',
  'boards',
] as const;

function readKindOf(subtype: string): ProjectCollabReadKind {
  if (subtype === 'sheets') return 'sheet';
  if (subtype === 'boards') return 'board';
  // `read_artifact` liest ein Canvas über die Art „presentation".
  if (subtype === 'presentations' || subtype === 'canvas') return 'presentation';
  return 'doc';
}

export async function getProjectCollabDocs(
  threadId: string,
  userId: string
): Promise<ProjectCollabDoc[]> {
  const rows = (await getPostgresInstance().query(
    `SELECT cd.id, cd.title, COALESCE(cd.document_subtype, 'docs') AS subtype
       FROM ${projectThreadScopeSql('$1', '$2')}
       JOIN group_content_shares gcs ON gcs.group_id = g.id AND gcs.content_type = 'collaborative_documents'
       -- content_id ist text, collaborative_documents.id uuid.
       JOIN collaborative_documents cd ON cd.id::text = gcs.content_id
      WHERE cd.deleted_at IS NULL AND cd.is_deleted = false
        AND COALESCE(cd.document_subtype, 'docs') = ANY($4::text[])
      ORDER BY gcs.shared_at DESC
      LIMIT $3`,
    [threadId, userId, PROJECT_COLLAB_DOC_CAP, [...LISTED_SUBTYPES]]
  )) as { id: string; title: string | null; subtype: string }[];

  const seen = new Set<string>();
  const out: ProjectCollabDoc[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      id: r.id,
      title: (r.title ?? '').trim().slice(0, TITLE_MAX_CHARS) || '(ohne Titel)',
      kind: readKindOf(r.subtype),
    });
  }
  return out;
}

const KIND_NOUN: Record<ProjectCollabReadKind, string> = {
  doc: 'Dokument',
  sheet: 'Tabelle',
  board: 'Board',
  presentation: 'Präsentation',
};

/** Der Prompt-Abschnitt; leer, wenn das Projekt nichts geteilt hat. */
export function formatProjectDocs(docs: readonly ProjectCollabDoc[] | null): string {
  if (!docs?.length) return '';
  const lines = docs.map((d) => `- ${d.title} (${KIND_NOUN[d.kind]}; kind=${d.kind}, id=${d.id})`);
  return `\n\n## DOKUMENTE DES PROJEKTS\n\nDiese Dokumente sind ins Projekt dieses Chats geteilt. Ihren Inhalt kennst du NICHT. Betrifft die Frage eines davon, lies es mit \`read_artifact\` (kind und id aus der Liste) und nenne in der Antwort seinen Titel als Quelle. Rate nie, was darin steht; ohne Bezug zur Frage lies nichts.\n\n${embedUntrusted('projekt_dokumente', lines.join('\n'))}`;
}

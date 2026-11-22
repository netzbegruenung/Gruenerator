/**
 * Die Docs, Präsentationen, Tabellen und Boards eines Projekts — als Titelliste
 * im Prompt seiner Chats, nicht als Inhalt.
 *
 * Der Text kollaborativer Dokumente liegt in Yjs. Ihn bei jedem Turn
 * mitzuschicken kostete rund 8k Token auch dort, wo die Frage kein Dokument
 * braucht. Fundstellen kommen aus der Suche (`getProjectCollabDocumentIds`,
 * Index in `services/docs/collabSearchIndex.ts`). Stattdessen sieht das Modell nur Titel, Art und
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
 * Wie viele Titel der Prompt höchstens nennt (Docs und Dateien zusammen, neueste
 * zuerst): je Zeile rund 25 Token, also gut 750 Token im Vollausbau. Mehr findet
 * das Modell über `groups` (search, content).
 */
export const PROJECT_COLLAB_DOC_CAP = 30;

/**
 * Wie viele indexierte Dokumente höchstens in den Dokument-Scope des Projekts
 * gehen (neueste zuerst). Wie `PROJECT_FILE_DOCUMENT_CAP` ein Sicherheitsdeckel
 * für den Qdrant-Filter, kein Auswahlkriterium.
 */
export const PROJECT_COLLAB_SEARCH_CAP = 50;

const TITLE_MAX_CHARS = 80;

/** Art, wie `read_artifact` sie als `kind` nimmt; `file` = hochgeladene Datei bzw. Text. */
export type ProjectCollabReadKind = 'doc' | 'sheet' | 'board' | 'presentation' | 'file';

export interface ProjectCollabDoc {
  id: string;
  title: string;
  kind: ProjectCollabReadKind;
}

/** Welche Arten gelistet werden — `video` hat keinen Text. */
export const PROJECT_COLLAB_SUBTYPES = [
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
  if (subtype === 'file') return 'file';
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
  // Docs und Dateien in EINER Liste: ohne die Dateien hatte das Modell für
  // „Lies die Datei X ganz" keine id und antwortete aus den Vorab-Treffern —
  // live 22.11.2026 mit dem falschen „letzten Satz".
  const rows = (await getPostgresInstance().query(
    `SELECT id, title, subtype FROM (
       SELECT cd.id::text AS id, cd.title, COALESCE(cd.document_subtype, 'docs') AS subtype, gcs.shared_at
         FROM ${projectThreadScopeSql('$1', '$2')}
         JOIN group_content_shares gcs ON gcs.group_id = g.id AND gcs.content_type = 'collaborative_documents'
         -- content_id ist text, collaborative_documents.id uuid.
         JOIN collaborative_documents cd ON cd.id::text = gcs.content_id
        WHERE cd.deleted_at IS NULL AND cd.is_deleted = false
          AND COALESCE(cd.document_subtype, 'docs') = ANY($4::text[])
       UNION ALL
       SELECT d.id::text AS id, COALESCE(NULLIF(d.title, ''), d.filename) AS title, 'file' AS subtype, gcs.shared_at
         FROM ${projectThreadScopeSql('$1', '$2')}
         JOIN group_content_shares gcs ON gcs.group_id = g.id AND gcs.content_type = 'documents'
         JOIN documents d ON d.id::text = gcs.content_id
        WHERE d.deleted_at IS NULL AND d.status = 'completed' AND d.user_id IS NOT NULL
     ) items
     ORDER BY shared_at DESC
     LIMIT $3`,
    [threadId, userId, PROJECT_COLLAB_DOC_CAP, [...PROJECT_COLLAB_SUBTYPES]]
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

/**
 * Die ins Projekt geteilten Dokumente, die in Qdrant stehen (`collab_search_index`,
 * siehe `services/docs/collabSearchIndex.ts`), als Dokument-IDs für den Suchbereich
 * des Chats — neben den Projekt-Dateien. Gleiche Zugriffsregel wie die Titelliste;
 * ein noch nicht indexiertes Dokument fehlt hier und bleibt über `read_artifact`
 * lesbar.
 */
export async function getProjectCollabDocumentIds(
  threadId: string,
  userId: string
): Promise<string[]> {
  const rows = (await getPostgresInstance().query(
    `SELECT cd.id
       FROM ${projectThreadScopeSql('$1', '$2')}
       JOIN group_content_shares gcs ON gcs.group_id = g.id AND gcs.content_type = 'collaborative_documents'
       JOIN collaborative_documents cd ON cd.id::text = gcs.content_id
       JOIN collab_search_index ci ON ci.document_id = cd.id AND ci.chunk_count > 0
      WHERE cd.deleted_at IS NULL AND cd.is_deleted = false
      ORDER BY gcs.shared_at DESC
      LIMIT $3`,
    [threadId, userId, PROJECT_COLLAB_SEARCH_CAP]
  )) as { id: string }[];
  return [...new Set(rows.map((r) => r.id))];
}

const KIND_NOUN: Record<ProjectCollabReadKind, string> = {
  doc: 'Dokument',
  sheet: 'Tabelle',
  board: 'Board',
  presentation: 'Präsentation',
  file: 'Datei',
};

/** Der Prompt-Abschnitt; leer, wenn das Projekt nichts geteilt hat. */
export function formatProjectDocs(docs: readonly ProjectCollabDoc[] | null): string {
  if (!docs?.length) return '';
  const lines = docs.map((d) => `- ${d.title} (${KIND_NOUN[d.kind]}; kind=${d.kind}, id=${d.id})`);
  const more =
    docs.length >= PROJECT_COLLAB_DOC_CAP
      ? ' Die Liste zeigt nur die neuesten; weitere findest du mit `groups` (action="search" oder "content").'
      : '';
  return `\n\n## DOKUMENTE DES PROJEKTS\n\nDiese Dokumente und Dateien sind ins Projekt dieses Chats geteilt. Vorab gefundene Stellen daraus sind nur Auszüge, nicht der ganze Inhalt. Geht es um den ganzen Inhalt, den genauen Wortlaut oder etwas, das in den Auszügen fehlt, lies es mit \`read_artifact\` (kind und id aus der Liste) und nenne in der Antwort seinen Titel als Quelle. Rate nie, was darin steht; ohne Bezug zur Frage lies nichts.${more}\n\n${embedUntrusted('projekt_dokumente', lines.join('\n'))}`;
}

/**
 * Höchstens so viele Dateien bzw. Docs liest ein Turn vorab ganz, weil die
 * Nachricht sie beim Titel nennt (`namedProjectDocs`). Zwei deckt „vergleiche
 * X und Y“ ab.
 */
export const NAMED_PROJECT_DOC_CAP = 2;

/** Kürzere Titel („Notizen“, „Protokoll“) sind Alltagswörter, kein Verweis. */
const NAMED_TITLE_MIN_CHARS = 8;

/**
 * Welche Einträge der Titelliste die Nachricht beim Namen nennt — der Titel
 * selbst oder ein Dateiname ohne Endung, Groß/klein egal. Kein Wortraten: nur
 * die Titel, die der Prompt ohnehin listet, wie `matchMcpServerByName` bei
 * Konnektoren. Ein so genannter Eintrag wird vorab ganz gelesen
 * (`seedNamedProjectDocs`), weil die Modelle sonst aus den Suchauszügen raten
 * statt `read_artifact` zu rufen (gemessen 22.11.2026, #5952: Gemma 0/6,
 * Mistral Large 2/6 Aufrufe).
 */
export function namedProjectDocs(
  text: string,
  docs: readonly ProjectCollabDoc[] | null
): ProjectCollabDoc[] {
  if (!docs?.length || !text.trim()) return [];
  const haystack = text.toLocaleLowerCase('de-DE');
  const hits: ProjectCollabDoc[] = [];
  for (const doc of docs) {
    const title = doc.title.trim().toLocaleLowerCase('de-DE');
    const stem = title.replace(/\.[a-z0-9]{1,5}$/, '');
    const named = [title, stem].some(
      (candidate) => candidate.length >= NAMED_TITLE_MIN_CHARS && haystack.includes(candidate)
    );
    if (named) hits.push(doc);
    if (hits.length >= NAMED_PROJECT_DOC_CAP) break;
  }
  return hits;
}

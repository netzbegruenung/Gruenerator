/**
 * `cloud_files` — die Dateiablagen der Person im agentischen Loop.
 *
 * EIN Werkzeug mit `action`-Enum, wie die Werkzeuge in `personalDataTools.ts`
 * und aus demselben Grund: der Werkzeugkatalog ist der größte Token-Posten
 * jedes Aufrufs, sechs Einzelwerkzeuge wären der teuerste mögliche Zuschnitt.
 *
 * Lesend, und zwar strukturell: der `CloudFileProvider` hat keine
 * Schreibmethoden. Die einzige Aktion mit Wirkung ist `add_connection`, und die
 * ändert das eigene KONTO, nicht die fremde Ablage — sie läuft deshalb über das
 * bestehende `confirm_action`-Protokoll und legt nichts an, bevor die Person
 * zugestimmt hat.
 *
 * Der Provider kommt über `ctx` herein, nicht über einen Import: so läuft der
 * Test ohne Netz und ohne Datenbank.
 */
import { type WolkeFolderRef } from '@gruenerator/contracts';
import { looksLikeCloudSharePath } from '@gruenerator/shared/utils';
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { lastUserText } from '../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { NotebookQdrantHelper } from '../../../database/services/NotebookQdrantHelper.js';
import {
  classifyWebdavStatus,
  statusOf,
} from '../../../services/api-clients/nextcloudApiClient.js';
import { extractTextFromFile } from '../../../services/document-services/DocumentProcessingService/textExtraction.js';
import { listAllCloudRoots, nextcloudShareProvider } from '../../../services/files/index.js';
import { createLogger } from '../../../utils/logger.js';
import { attachedCloudShareLinks, findCloudShareUrls } from '../services/cloudConnectionContext.js';
import { emitToolConfirmAction, newActionId } from '../services/confirmActionService.js';

import type {
  ChatGraphState,
  PendingAction,
  SearchResult,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type {
  CloudConnectionErrorCode,
  CloudEntry,
  CloudFileProvider,
  CloudRoot,
} from '../../../services/files/index.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const log = createLogger('cloudFileTools');

/** Wie viele Einträge höchstens in die Modellantwort wandern. */
const MAX_ENTRIES_IN_ANSWER = 40;

/** Wie viel Text ein `read` höchstens erdet, bevor es in Stücke zerfällt. */
const READ_CHUNK_CHARS = 4000;
const READ_MAX_CHUNKS = 6;

/**
 * Wie viel eine registrierte Auflistung im Quellenblock behalten darf.
 *
 * Der Standard der Registry sind 1500 Zeichen (`SNIPPET_CHARS`); 40 Einträge
 * mit Pfad und Größe liegen darüber und wuerden still abgeschnitten - genau
 * die Ausfallform, gegen die `renderListing` unten seine `note` schreibt.
 */
const LISTING_SNIPPET_CHARS = 4000;

/** Ein an ein Notebook gehängter Wolke-Ordner, mit dem Notebook dazu. */
export interface AttachedNotebookFolder {
  shareLinkId: string;
  folderPath: string;
  folderName: string;
  notebook: string;
  includeSubfolders: boolean;
}

let notebookHelperSingleton: NotebookQdrantHelper | null = null;
function notebookHelper(): NotebookQdrantHelper {
  notebookHelperSingleton ??= new NotebookQdrantHelper();
  return notebookHelperSingleton;
}

/**
 * Die an Notebooks gehängten Wolke-Ordner der Person.
 *
 * Sie liegen NICHT bei der Verbindung, sondern je Notebook in
 * `settings.wolke_folders` im Qdrant-Payload - eine Verbindung weiss also von
 * sich aus nicht, wofür sie benutzt wird. Hier wird das umgedreht, damit
 * `list_connections` die eigentliche Frage dahinter („verbunden wofür?") mit
 * EINEM Aufruf mitbeantwortet.
 */
async function listAttachedNotebookFolders(userId: string): Promise<AttachedNotebookFolder[]> {
  const collections = await notebookHelper().getUserNotebookCollectionsLight(userId);
  return collections.flatMap((collection) => {
    const raw = collection.settings?.wolke_folders;
    if (!Array.isArray(raw)) return [];
    return (raw as WolkeFolderRef[])
      .filter((f) => f && typeof f.shareLinkId === 'string' && typeof f.folderPath === 'string')
      .map((f) => ({
        shareLinkId: f.shareLinkId,
        folderPath: f.folderPath,
        folderName: f.folderName || f.folderPath.split('/').filter(Boolean).pop() || '/',
        notebook: collection.name,
        includeSubfolders: f.includeSubfolders === true,
      }));
  });
}

export interface CloudToolCtx {
  state: ChatGraphState;
  sse: SSEWriter;
  threadId: string | null;
  sourceRegistry: SourceRegistry;
  /** Der Anbieter, über den gelesen wird. Injiziert, damit der Test ihn fälscht. */
  provider?: CloudFileProvider;
  /** Alle Wurzeln der Person. Injiziert aus demselben Grund. */
  listRoots?: (userId: string) => Promise<CloudRoot[]>;
  /** Die an Notebooks gehängten Ordner. Injiziert, damit der Test ohne Qdrant
   *  läuft. */
  listNotebookFolders?: (userId: string) => Promise<AttachedNotebookFolder[]>;
}

const NO_SESSION = 'Keine Nutzer-Sitzung — diese Aktion braucht eine angemeldete Person.';
const NO_CONNECTION =
  'Für dieses Konto ist keine Wolke verbunden. Eine Verbindung entsteht über einen öffentlichen Freigabe-Link aus der Wolke — entweder unter Einstellungen → Wolke, oder hier im Chat mit action="add_connection".';

/**
 * Die eine errorCode→Prosa-Stelle im Backend, ans MODELL gerichtet: sie muss
 * die nächste sinnvolle Aktion nennen, nicht nur den Befund. Die
 * personengerichtete Schwester lebt in
 * `packages/wolke/src/lib/connectionErrors.ts` — zwei Maps, weil die API kein
 * Frontend-Paket importiert und die Adressaten verschieden sind.
 *
 * Zur 401-Deutung (`invalid_link`): `public.php/webdav` prüft die Auth VOR der
 * Pfadauflösung, ein 401 heißt also immer „Token abgewiesen" — Freigabe
 * gelöscht, abgelaufen oder passwortgeschützt (wir senden ein leeres Passwort).
 */
const CLOUD_ERROR_REASONS: Record<CloudConnectionErrorCode, string> = {
  invalid_link:
    'Der Freigabe-Link ist nicht (mehr) nutzbar: Entweder hat er nicht die Form https://<wolke>/s/<token>, oder die Freigabe wurde gelöscht, ist abgelaufen oder ist passwortgeschützt. Die Person kann in der Wolke einen neuen Link ohne Passwort erstellen und ihn unter Einstellungen → Wolke (oder hier per add_connection) neu verbinden — sag ihr das.',
  forbidden: 'Die Freigabe ist nicht mehr aktiv.',
  not_found: 'Unter diesem Link liegt nichts (mehr).',
  file_drop:
    'Das ist eine Upload-Freigabe („Dateien ablegen") — aus ihr kann nichts gelesen werden. Die Person braucht einen Freigabe-Link mit der Berechtigung „Nur anzeigen" — sag ihr das.',
  unknown: 'Der Link ließ sich nicht öffnen.',
};

function requireUserId(state: ChatGraphState): string | null {
  return state.agentConfig?.userId ?? null;
}

/** Anzeigename einer Wurzel — nie der Link, der ist das Zugangsmittel. */
function rootLabel(root: CloudRoot): string {
  const base = root.label || root.host || 'Wolke';
  return root.origin === 'group' && root.sharedVia
    ? `${base} (geteilt über ${root.sharedVia.groupName})`
    : base;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function entryLine(entry: CloudEntry): string {
  const parts = [entry.isDirectory ? 'Ordner' : formatSize(entry.size)].filter(Boolean);
  if (!entry.isDirectory && !entry.isSupported) parts.push('nicht auslesbar');
  return parts.join(' · ');
}

/**
 * Eine Auflistung so zurückgeben, dass eine Kürzung SICHTBAR ist. Eine stumm
 * abgeschnittene Liste ist die teuerste Ausfallform — sie sieht aus wie eine
 * vollständige Antwort.
 */
function renderListing(
  root: CloudRoot,
  path: string,
  listing: { entries: CloudEntry[]; folderCount: number; depthLimited: boolean; truncated: boolean }
): Record<string, unknown> {
  const shown = listing.entries.slice(0, MAX_ENTRIES_IN_ANSWER);
  const notes: string[] = [];
  if (listing.entries.length > shown.length) {
    notes.push(
      `Nur die ersten ${shown.length} von ${listing.entries.length} Einträgen sind hier aufgeführt.`
    );
  }
  if (listing.truncated) {
    notes.push(
      'Der Ordner enthält mehr Dateien, als ein Durchlauf erfasst — die Liste ist unvollständig.'
    );
  }
  if (listing.depthLimited) {
    notes.push('Tiefer liegende Unterordner wurden nicht mehr geöffnet.');
  }
  return {
    connectionId: root.connectionId,
    connection: rootLabel(root),
    path: path || '/',
    entryCount: listing.entries.length,
    folderCount: listing.folderCount,
    entries: shown.map((e) => ({
      path: e.path,
      name: e.name,
      isDirectory: e.isDirectory,
      readable: e.isSupported,
      info: entryLine(e),
    })),
    ...(notes.length ? { note: notes.join(' ') } : {}),
  };
}

/** Wurzel per Id auflösen, mit einer Fehlermeldung, die das Modell weiterbringt. */
function pickRoot(
  roots: CloudRoot[],
  connectionId: string | undefined
): { root: CloudRoot } | { error: string } {
  const usable = roots.filter((r) => r.isActive);
  if (usable.length === 0) return { error: NO_CONNECTION };
  if (!connectionId) {
    if (usable.length === 1) return { root: usable[0] };
    return {
      error: `Es gibt mehrere Verbindungen — gib connectionId an. Verfügbar: ${usable
        .map((r) => `${r.connectionId} (${rootLabel(r)})`)
        .join(', ')}`,
    };
  }
  const match = usable.find((r) => r.connectionId === connectionId);
  if (!match) {
    return {
      error: `Keine aktive Verbindung mit der Id "${connectionId}". Rufe zuerst action="list_connections" auf.`,
    };
  }
  return { root: match };
}

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Eine Auflistung als QUELLE eintragen — nicht als Vorgangsnotiz.
 *
 * Der Schreiber im split-Modus sieht keine Werkzeugergebnisse, sondern nur den
 * gerenderten Quellenblock. `note()` landet dort unter „VORGÄNGE IN DIESEM TURN
 * (… KEINE Quellen)" und ist damit ausdrücklich kein Antwortmaterial. Live am
 * 01.09.2026 hatte `list_connections` die eine Verbindung geholt, und die
 * Antwort lautete trotzdem „mir liegen keine Informationen darüber vor" —
 * derselbe Ausfall, den `ground()` in `personalDataTools.ts` beschreibt, und
 * dieselbe Trennung ist die Reparatur: Listen registrieren, Vorgänge notieren.
 *
 * EINE Quelle je Auflistung, nicht eine je Eintrag: `checkSearchBudget` deckelt
 * bei MAX_SOURCES (20) gegen `freshSize`, ein Ordner mit 40 Dateien würde dem
 * Loop also vortäuschen, er habe genug recherchiert.
 */
function groundText(reg: SourceRegistry, title: string, content: string): void {
  if (!content.trim()) return;
  reg.register([{ source: 'wolke', title, content }], {
    snippetChars: LISTING_SNIPPET_CHARS,
  });
}

/**
 * Eine Vorgangszeile — geprüft, verbunden, nichts gefunden.
 *
 * Bleibt bei `note()`: das ist kein abgerufenes Material. Als Quelle eingetragen
 * würde es als Recherche DIESES Turns persistiert und könnte später den Inhalt
 * eines Dokuments stellen — der Grund, den `sourceRegistry.note` nennt.
 */
function groundNote(reg: SourceRegistry, title: string, content: string): void {
  reg.note(title, content);
}

/**
 * Das Ergebnis von `renderListing` erden — als Quelle, wenn etwas drinsteht,
 * sonst als Fehlanzeige. Der Schreiber bekommt hier dieselben Einträge wie die
 * Karte, samt Pfad: ohne ihn kann er den Ordner benennen, aber nichts daraus
 * zitieren und keinen Folgeaufruf vorbereiten.
 */
function groundListing(
  reg: SourceRegistry,
  title: string,
  rendered: Record<string, unknown>,
  emptyNote: string
): void {
  const entries = (rendered.entries ?? []) as Array<{
    path: string;
    name: string;
    isDirectory: boolean;
    info: string;
  }>;
  if (entries.length === 0) {
    groundNote(reg, title, emptyNote);
    return;
  }
  const lines = entries.map(
    (e) => `${e.name}${e.isDirectory ? '/' : ''} — ${e.path}${e.info ? ` (${e.info})` : ''}`
  );
  const note = typeof rendered.note === 'string' ? rendered.note : '';
  groundText(reg, title, [lines.join('\n'), note].filter(Boolean).join('\n\n'));
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length && chunks.length < READ_MAX_CHUNKS; i += READ_CHUNK_CHARS) {
    chunks.push(text.slice(i, i + READ_CHUNK_CHARS));
  }
  return chunks;
}

export function makeCloudFilesTool(ctx: CloudToolCtx): Tool {
  const { state, sse, threadId, sourceRegistry } = ctx;
  const provider = ctx.provider ?? nextcloudShareProvider;
  const rootsOf = ctx.listRoots ?? listAllCloudRoots;
  const foldersOf = ctx.listNotebookFolders ?? listAttachedNotebookFolders;

  // Über `@link` angehängte Freigabe-Links stehen nicht im Nachrichtentext —
  // ohne diese Zeile weiß das Modell nichts von ihnen und könnte
  // `add_connection` gar nicht mit ihnen aufrufen. GETIPPTE Links stehen zwar
  // im Text, aber ohne diesen Hinweis nahm das Modell live den URL-Pfad
  // (`s/<token>`) als Dateipfad für `read` — der sanktionierte Weg muss im
  // Werkzeug selbst stehen.
  const attachedLinks = [
    ...new Set([
      ...attachedCloudShareLinks(state.attachedWebpageUrls),
      ...findCloudShareUrls(state.lastUserTextNoMentions ?? lastUserText(state)),
    ]),
  ];
  const attachedNote =
    attachedLinks.length > 0
      ? `\n\nIn dieser Nachricht ist ein Freigabe-Link ANGEHÄNGT oder GENANNT: ${attachedLinks.join(', ')}. Für einen solchen Link sind add_connection und test_connection die richtigen Aktionen (dabei darf 'link' entfallen — der angehängte bzw. genannte wird genommen); als 'path' für list/read taugt er nie.`
      : '';

  return tool({
    description: `Zugriff auf die verbundene WOLKE der Person (Nextcloud-Freigaben) — Ordner durchsehen, Dateien finden und lesen.

NUTZE FÜR: welche Wolke-Ordner/-Links die Person verbunden hat und an welchen Notebooks sie hängen (list_connections — beantwortet „welche Ordner sind verbunden?" vollständig, ein zweiter Aufruf ist dafür nicht nötig), was in einem Ordner liegt (list), eine Datei über ihren Namen finden (find), den Inhalt einer Datei lesen und zitieren (read), eine Verbindung prüfen (test_connection), einen Freigabe-Link hinzufügen (add_connection — wird der Person zur Bestätigung angezeigt).

NICHT für: Dateien, die in DIESER Nachricht angehängt sind (dafür 'dokumente_lesen'), eigene Grünerator-Dokumente und Tabellen (dafür 'documents'), Notebooks (dafür 'notebooks') oder das Web (dafür 'web_search').

Der Zugriff ist ausschließlich lesend — Schreiben, Umbenennen und Löschen in der Wolke gibt es nicht. Pfade sind immer relativ zur Verbindung; nimm sie aus einer vorherigen Antwort, rate sie nie.${attachedNote}`,
    inputSchema: z.object({
      action: z.enum([
        'list_connections',
        'list',
        'find',
        'read',
        'test_connection',
        'add_connection',
      ]),
      connectionId: z
        .string()
        .optional()
        .describe('Id aus list_connections; bei genau einer Verbindung weglassbar'),
      path: z
        .string()
        .optional()
        .describe('Ordner- bzw. Dateipfad relativ zur Verbindung (list/read)'),
      recursive: z
        .boolean()
        .default(false)
        .describe('Bei list: auch Unterordner durchlaufen (langsamer)'),
      name: z.string().optional().describe('Namensbestandteil der gesuchten Datei (find)'),
      extensions: z
        .array(z.string())
        .optional()
        .describe('Endungen als Filter, z. B. ["pdf"] (find)'),
      link: z
        .string()
        .optional()
        .describe('Öffentlicher Freigabe-Link (add_connection, test_connection)'),
      label: z.string().optional().describe('Anzeigename der neuen Verbindung (add_connection)'),
    }),
    execute: async ({ action, connectionId, path, recursive, name, extensions, link, label }) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };

      // Ein angehängter Link ist der Rückfall, nicht der Vorrang: nennt das
      // Modell einen, gilt der genannte — und ein `connectionId` meint eine
      // GESPEICHERTE Verbindung, da darf der Anhang nicht dazwischenfahren.
      const resolvedLink =
        link?.trim() ||
        (action === 'add_connection' || !connectionId ? attachedLinks[0] : undefined) ||
        undefined;

      if (action === 'add_connection') {
        return addConnection({
          userId,
          link: resolvedLink,
          label,
          provider,
          sse,
          threadId,
          sourceRegistry,
        });
      }

      if (action === 'test_connection' && resolvedLink) {
        // Ein noch nicht gespeicherter Link — genau der Fall, den die
        // Einrichtung in den Einstellungen abdeckt.
        const result = await provider.test({ link: resolvedLink });
        const note = result.ok
          ? `Der Link funktioniert${result.entryCount != null ? ` und enthält ${result.entryCount} Einträge` : ''}.`
          : `Der Link ist nicht nutzbar. ${CLOUD_ERROR_REASONS[result.errorCode ?? 'unknown']}`;
        groundNote(sourceRegistry, 'Wolke-Link geprüft', note);
        return { ...result, note };
      }

      let roots: CloudRoot[];
      try {
        roots = await rootsOf(userId);
      } catch (err) {
        log.warn('listRoots failed', err);
        const message = `Verbindungen konnten nicht geladen werden: ${errMessage(err)}`;
        groundNote(sourceRegistry, 'Wolke', message);
        return { error: message };
      }

      if (action === 'list_connections') {
        const active = roots.filter((r) => r.isActive);
        if (active.length === 0) {
          // Kein leeres Ergebnis zurückgeben: eine erfundene Fehlanzeige („du
          // hast keine Dateien") ist teurer als ein klarer Hinweis. Bleibt eine
          // Vorgangszeile — eine Fehlanzeige ist kein abgerufenes Material.
          groundNote(sourceRegistry, 'Wolke', NO_CONNECTION);
          return { connectionCount: 0, connections: [], note: NO_CONNECTION };
        }
        // Die Ordner dürfen die Antwort nicht aufhalten: sie liegen in Qdrant,
        // die Verbindungen in Postgres. Fällt Qdrant aus, ist „diese
        // Verbindungen hast du" immer noch die richtige Antwort — nur ohne das
        // „wofür". Eine Wolke-Frage darf nicht am Notebook-Speicher sterben.
        let folders: AttachedNotebookFolder[] = [];
        let folderNote: string | null = null;
        try {
          folders = await foldersOf(userId);
        } catch (err) {
          log.warn('listNotebookFolders failed', err);
          folderNote =
            'Welche Ordner an Notebooks hängen, ließ sich diesmal nicht laden — die Verbindungen stimmen trotzdem.';
        }
        const connections = active.map((r) => ({
          connectionId: r.connectionId,
          label: rootLabel(r),
          host: r.host,
          origin: r.origin,
          folders: folders
            .filter((f) => f.shareLinkId === r.connectionId)
            .map((f) => ({
              folderPath: f.folderPath,
              folderName: f.folderName,
              notebook: f.notebook,
              includeSubfolders: f.includeSubfolders,
            })),
        }));
        groundText(
          sourceRegistry,
          'Verbundene Wolke-Ordner',
          connections
            .map((c) => {
              const attached = c.folders.length
                ? c.folders
                    .map((f) => `${f.folderName} (${f.folderPath}) → Notebook „${f.notebook}"`)
                    .join('; ')
                : 'an kein Notebook gehängt';
              return `${c.label} (${c.host}) — ${attached}`;
            })
            .join('\n')
        );
        return {
          connectionCount: connections.length,
          connections,
          ...(folderNote ? { note: folderNote } : {}),
        };
      }

      const picked = pickRoot(roots, connectionId);
      if ('error' in picked) {
        groundNote(sourceRegistry, 'Wolke', picked.error);
        return { error: picked.error };
      }
      const root = picked.root;

      // Ein Freigabe-Link ist keine Pfadangabe. Live nahm das Modell den
      // URL-Pfad eines geposteten Links (`s/<token>`) als `path` für `read` —
      // der lief dann mit dem Token der GESPEICHERTEN Verbindung gegen einen
      // fremden Share und scheiterte als nichtssagender 401.
      if ((action === 'list' || action === 'read') && path && looksLikeCloudSharePath(path)) {
        const message =
          'Das ist ein Freigabe-Link, kein Dateipfad. Eine neue Freigabe verbindest du mit action="add_connection" und link="<URL>" (oder prüfst sie mit test_connection); Pfade kommen aus einer list-Antwort.';
        groundNote(sourceRegistry, 'Wolke', message);
        return { error: message };
      }

      try {
        if (action === 'test_connection') {
          const result = await provider.test(root);
          const note = result.ok
            ? `„${rootLabel(root)}" ist erreichbar${result.entryCount != null ? ` (${result.entryCount} Einträge)` : ''}.`
            : `„${rootLabel(root)}" antwortet nicht. ${CLOUD_ERROR_REASONS[result.errorCode ?? 'unknown']}`;
          groundNote(sourceRegistry, 'Wolke-Verbindung geprüft', note);
          return { ...result, note };
        }

        if (action === 'list') {
          const listing = await provider.list(root, path ?? '', { recursive });
          const rendered = renderListing(root, path ?? '', listing);
          groundListing(
            sourceRegistry,
            `Wolke: ${rootLabel(root)}${path ? ` / ${path}` : ''}`,
            rendered,
            'Der Ordner ist leer.'
          );
          return rendered;
        }

        if (action === 'find') {
          if (!name?.trim() && !extensions?.length) {
            return { error: 'find braucht einen name oder extensions.' };
          }
          const listing = await provider.find(root, {
            ...(name?.trim() ? { name: name.trim() } : {}),
            ...(extensions?.length ? { extensions } : {}),
          });
          const rendered = renderListing(root, '', listing);
          groundListing(
            sourceRegistry,
            `Wolke-Suche: ${name ?? extensions?.join(', ')}`,
            rendered,
            'kein Treffer'
          );
          return rendered;
        }

        // read
        if (!path?.trim()) return { error: 'read braucht einen path.' };
        const download = await provider.read(root, path);
        const fileName = path.split('/').filter(Boolean).pop() ?? path;
        const text = await extractTextFromFile({
          buffer: download.buffer,
          mimetype: download.mimeType ?? 'application/octet-stream',
          originalname: fileName,
          size: download.size,
        });
        if (!text.trim()) {
          const message = `Aus „${fileName}" ließ sich kein Text gewinnen — das Format wird nicht unterstützt oder die Datei ist leer.`;
          groundNote(sourceRegistry, 'Wolke', message);
          return { error: message };
        }
        const chunks = chunkText(text);
        const sources = sourceRegistry.register(
          chunks.map((content, idx): SearchResult => ({
            source: `wolke:${root.connectionId}:${path}`,
            title: fileName,
            content,
            relevance: 0.7,
            chunkIndex: idx,
          }))
        );
        return {
          file: fileName,
          connection: rootLabel(root),
          resultCount: chunks.length,
          sources: sources ?? '',
          ...(text.length > READ_CHUNK_CHARS * READ_MAX_CHUNKS
            ? { note: 'Die Datei ist länger als der gelesene Ausschnitt.' }
            : {}),
        };
      } catch (err) {
        log.warn(`[cloud_files] ${action} failed`, err);
        // Der Status kommt als `NextcloudHttpError` durch alle Re-Wraps des
        // Clients — hier wird er zur Handlungsanweisung. Ohne die Erdung als
        // Vorgangsnotiz sieht der Schreiber im split-Modus vom Fehlschlag
        // NICHTS und erfindet eine Begründung („ich kann keine externen Links
        // lesen" — live am 06.09.2026).
        const code = classifyWebdavStatus(statusOf(err));
        const detail =
          code === 'not_found'
            ? 'Die Datei oder der Ordner wurde unter diesem Pfad nicht gefunden — prüfe den Pfad mit action="list".'
            : code === 'unknown'
              ? errMessage(err)
              : CLOUD_ERROR_REASONS[code];
        const message = `Wolke-Zugriff auf „${rootLabel(root)}" fehlgeschlagen: ${detail}`;
        groundNote(sourceRegistry, 'Wolke-Zugriff fehlgeschlagen', message);
        return { error: message, ...(code !== 'unknown' ? { errorCode: code } : {}) };
      }
    },
  });
}

/**
 * Eine Verbindung anlegen — die einzige Aktion mit Wirkung.
 *
 * Erst prüfen, DANN fragen: die Zahl der Einträge steht auf der
 * Bestätigungskarte, damit die Person sieht, was sie freigibt. Gespeichert wird
 * nichts, bevor sie zustimmt; das erledigt `confirmController.executeAction`.
 */
async function addConnection(args: {
  userId: string;
  link: string | undefined;
  label: string | undefined;
  provider: CloudFileProvider;
  sse: SSEWriter;
  threadId: string | null;
  sourceRegistry: SourceRegistry;
}): Promise<Record<string, unknown>> {
  const { link, label, provider, sse, threadId, userId, sourceRegistry } = args;
  const raw = link?.trim();
  if (!raw) return { error: 'add_connection braucht den Freigabe-Link (link).' };
  if (!threadId) return { error: 'Verbinden ist in diesem Kontext nicht möglich.' };

  let host: string;
  try {
    host = new URL(raw).host;
  } catch {
    return { error: 'Das ist keine gültige URL.' };
  }

  const test = await provider.test({ link: raw });
  if (!test.ok) {
    const note = CLOUD_ERROR_REASONS[test.errorCode ?? 'unknown'];
    groundNote(sourceRegistry, 'Wolke-Link nicht nutzbar', note);
    return { ok: false, errorCode: test.errorCode ?? 'unknown', note };
  }

  const pending: PendingAction = {
    actionId: newActionId(),
    threadId,
    userId,
    title: 'Wolke-Verbindung hinzufügen',
    preview: `${host} verbinden${label?.trim() ? ` als „${label.trim()}"` : ''}`,
    createdAt: Date.now(),
    type: 'add_cloud_connection',
    payload: {
      shareLink: raw,
      label: label?.trim() || null,
      host,
      entryCount: test.entryCount ?? null,
    },
  };
  await emitToolConfirmAction(sse, pending, [
    { key: 'Wolke', value: host },
    ...(label?.trim() ? [{ key: 'Name', value: label.trim() }] : []),
    ...(test.entryCount != null
      ? [{ key: 'Inhalt', value: `${test.entryCount} Einträge im Wurzelordner` }]
      : []),
    { key: 'Zugriff', value: 'nur lesend' },
  ]);
  const note = `Der Link zu ${host} funktioniert. Bestätigung zum Hinzufügen angefordert.`;
  groundNote(sourceRegistry, 'Wolke verbinden', note);
  return { ok: true, needsConfirmation: true, note };
}

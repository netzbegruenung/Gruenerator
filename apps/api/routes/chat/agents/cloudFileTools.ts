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
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import { extractTextFromFile } from '../../../services/document-services/DocumentProcessingService/textExtraction.js';
import { listAllCloudRoots, nextcloudShareProvider } from '../../../services/files/index.js';
import { createLogger } from '../../../utils/logger.js';
import { attachedCloudShareLinks } from '../services/cloudConnectionContext.js';
import { emitToolConfirmAction, newActionId } from '../services/confirmActionService.js';

import type {
  ChatGraphState,
  PendingAction,
  SearchResult,
} from '../../../agents/langgraph/ChatGraph/types.js';
import type { CloudEntry, CloudFileProvider, CloudRoot } from '../../../services/files/index.js';
import type { SourceRegistry } from '../services/agenticLoop/sourceRegistry.js';
import type { SSEWriter } from '../services/sseHelpers.js';

const log = createLogger('cloudFileTools');

/** Wie viele Einträge höchstens in die Modellantwort wandern. */
const MAX_ENTRIES_IN_ANSWER = 40;

/** Wie viel Text ein `read` höchstens erdet, bevor es in Stücke zerfällt. */
const READ_CHUNK_CHARS = 4000;
const READ_MAX_CHUNKS = 6;

export interface CloudToolCtx {
  state: ChatGraphState;
  sse: SSEWriter;
  threadId: string | null;
  sourceRegistry: SourceRegistry;
  /** Der Anbieter, über den gelesen wird. Injiziert, damit der Test ihn fälscht. */
  provider?: CloudFileProvider;
  /** Alle Wurzeln der Person. Injiziert aus demselben Grund. */
  listRoots?: (userId: string) => Promise<CloudRoot[]>;
}

const NO_SESSION = 'Keine Nutzer-Sitzung — diese Aktion braucht eine angemeldete Person.';
const NO_CONNECTION =
  'Für dieses Konto ist keine Wolke verbunden. Eine Verbindung entsteht über einen öffentlichen Freigabe-Link aus der Wolke — entweder unter Einstellungen → Wolke, oder hier im Chat mit action="add_connection".';

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

  // Über `@link` angehängte Freigabe-Links stehen nicht im Nachrichtentext —
  // ohne diese Zeile weiß das Modell nichts von ihnen und könnte
  // `add_connection` gar nicht mit ihnen aufrufen.
  const attachedLinks = attachedCloudShareLinks(state.attachedWebpageUrls);
  const attachedNote =
    attachedLinks.length > 0
      ? `\n\nIn dieser Nachricht ist ein Freigabe-Link ANGEHÄNGT: ${attachedLinks.join(', ')}. Bei add_connection und test_connection darf 'link' dann entfallen — der angehängte wird genommen.`
      : '';

  return tool({
    description: `Zugriff auf die verbundene WOLKE der Person (Nextcloud-Freigaben) — Ordner durchsehen, Dateien finden und lesen.

NUTZE FÜR: welche Wolke-Links/-Verbindungen die Person verbunden hat (list_connections), was in einem Ordner liegt (list), eine Datei über ihren Namen finden (find), den Inhalt einer Datei lesen und zitieren (read), eine Verbindung prüfen (test_connection), einen Freigabe-Link hinzufügen (add_connection — wird der Person zur Bestätigung angezeigt).

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
          : `Der Link ist nicht nutzbar (${result.errorCode ?? 'unknown'}).`;
        sourceRegistry.note('Wolke-Link geprüft', note);
        return { ...result, note };
      }

      let roots: CloudRoot[];
      try {
        roots = await rootsOf(userId);
      } catch (err) {
        log.warn('listRoots failed', err);
        return { error: `Verbindungen konnten nicht geladen werden: ${errMessage(err)}` };
      }

      if (action === 'list_connections') {
        const active = roots.filter((r) => r.isActive);
        if (active.length === 0) {
          // Kein leeres Ergebnis zurückgeben: eine erfundene Fehlanzeige („du
          // hast keine Dateien") ist teurer als ein klarer Hinweis.
          sourceRegistry.note('Wolke', NO_CONNECTION);
          return { connectionCount: 0, connections: [], note: NO_CONNECTION };
        }
        const connections = active.map((r) => ({
          connectionId: r.connectionId,
          label: rootLabel(r),
          host: r.host,
          origin: r.origin,
        }));
        sourceRegistry.note(
          'Wolke-Verbindungen',
          connections.map((c) => `${c.label} (${c.host})`).join(', ')
        );
        return { connectionCount: connections.length, connections };
      }

      const picked = pickRoot(roots, connectionId);
      if ('error' in picked) return { error: picked.error };
      const root = picked.root;

      try {
        if (action === 'test_connection') {
          const result = await provider.test(root);
          const note = result.ok
            ? `„${rootLabel(root)}" ist erreichbar${result.entryCount != null ? ` (${result.entryCount} Einträge)` : ''}.`
            : `„${rootLabel(root)}" antwortet nicht (${result.errorCode ?? 'unknown'}).`;
          sourceRegistry.note('Wolke-Verbindung geprüft', note);
          return { ...result, note };
        }

        if (action === 'list') {
          const listing = await provider.list(root, path ?? '', { recursive });
          const rendered = renderListing(root, path ?? '', listing);
          sourceRegistry.note(
            `Wolke: ${rootLabel(root)}${path ? ` / ${path}` : ''}`,
            listing.entries
              .slice(0, MAX_ENTRIES_IN_ANSWER)
              .map((e) => `${e.name}${e.isDirectory ? '/' : ''}`)
              .join(', ') || 'leer'
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
          sourceRegistry.note(
            `Wolke-Suche: ${name ?? extensions?.join(', ')}`,
            listing.entries.length
              ? listing.entries
                  .slice(0, MAX_ENTRIES_IN_ANSWER)
                  .map((e) => e.path)
                  .join(', ')
              : 'kein Treffer'
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
          return {
            error: `Aus „${fileName}" ließ sich kein Text gewinnen — das Format wird nicht unterstützt oder die Datei ist leer.`,
          };
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
        return { error: `Wolke-Zugriff fehlgeschlagen: ${errMessage(err)}` };
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
    const reasons: Record<string, string> = {
      invalid_link:
        'Der Link sieht nicht wie ein öffentlicher Freigabe-Link aus (er muss die Form https://<wolke>/s/<token> haben) oder ist passwortgeschützt.',
      forbidden: 'Die Freigabe ist nicht mehr aktiv.',
      not_found: 'Unter diesem Link liegt nichts (mehr).',
      unknown: 'Der Link ließ sich nicht öffnen.',
    };
    const note = reasons[test.errorCode ?? 'unknown'] ?? reasons.unknown;
    sourceRegistry.note('Wolke-Link nicht nutzbar', note);
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
  sourceRegistry.note('Wolke verbinden', note);
  return { ok: true, needsConfirmation: true, note };
}

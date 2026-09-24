/**
 * `dokumente_lesen` über den Volltext der angehängten Dokumente: eine Seite
 * lesen (`seite`), ein Wort vollständig zählen (`wortsuche`), ein Zitat prüfen
 * (`zitat`). Dieselbe reine Logik wie `notebook_quellen` (read/grep/cite), nur
 * mit einem anderen Loader — Vorlage ist `notebookSourceSystemActions.ts`.
 *
 * DIE Zugriffsregel: gelesen wird nur, was an diesem Turn hängt (`sources`
 * kommt aus `retrievableAttachedSources`, also derselben Auswahl wie Seed und
 * Passagensuche) UND der Person gehört (`documents.user_id`; ohne Zeile filtert
 * Qdrant nach der user_id). Das Modell nennt höchstens einen Dateinamen, nie eine ID.
 */
import { getPostgresInstance } from '../../../../database/services/PostgresService.js';
import {
  readSourceText,
  SLICE_REGISTER_CHARS,
  sliceSource,
  type NotebookSourcesDeps,
  type SourceText,
} from '../../../../services/notebook/notebookSources.js';
import { locateQuoteInSources } from '../../../../services/notebook/sourceCite.js';
import {
  grepSources,
  incompleteReason,
  readScanSources,
  SCAN_CHAR_BUDGET,
  shownGrepSources,
  type ScanLoad,
} from '../../../../services/notebook/sourceGrep.js';
import { pickRange } from '../../agents/notebookSourceRange.js';
import { notExhaustiveGrep } from '../../agents/notebookSourceReadActions.js';

import type { SourceRegistry } from './sourceRegistry.js';
import type { DocumentSource, SearchResult } from '../../../../agents/langgraph/ChatGraph/types.js';

export type AttachedDocDeps = Pick<NotebookSourcesDeps, 'db' | 'documentService'>;

export interface AttachedDocModeArgs {
  seite?: number | undefined;
  wortsuche?: { phrase: string; grossKlein?: boolean | undefined } | undefined;
  zitat?: string | undefined;
}

export interface AttachedDocCtx {
  userId: string | null;
  /** Die Anhänge des Turns, schon auf `dateiname` eingegrenzt. */
  sources: readonly DocumentSource[];
  sourceRegistry: SourceRegistry;
  deps?: Partial<AttachedDocDeps> | undefined;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_READABLE = 'Das angehängte Dokument ist nicht lesbar.';
const NONE_READABLE = 'Keines der angehängten Dokumente ist lesbar.';
/** Fundstellen mit Kontext je Datei — das Maximum von `grepText`. Gezählt werden alle. */
const GREP_CONTEXTS = 5;

async function resolveDeps(
  partial: Partial<AttachedDocDeps> | undefined
): Promise<AttachedDocDeps> {
  const documentService =
    partial?.documentService ??
    (
      await import('../../../../services/document-services/DocumentSearchService/index.js')
    ).getQdrantDocumentService();
  return { db: partial?.db ?? getPostgresInstance(), documentService };
}

/**
 * Die IDs unter `sources`, die gelesen werden dürfen. Mit `documents`-Zeile nur,
 * wenn sie der Person gehört. Ohne Zeile (Anhänge aus dem Fallback
 * `embedThreadAttachmentForRag`, die nur in Qdrant liegen) liest
 * `readSourceText` bloß die Chunks — und `getDocumentChunks` filtert dort selbst
 * nach der user_id.
 */
async function readableIds(
  userId: string,
  sources: readonly DocumentSource[],
  db: AttachedDocDeps['db']
): Promise<Set<string>> {
  const ids = sources.map((s) => s.id).filter((id) => UUID_RE.test(id));
  if (ids.length === 0) return new Set();
  const rows = await db.query<{ id: string; user_id: string | null }>(
    'SELECT id, user_id FROM documents WHERE id = ANY($1::uuid[])',
    [ids]
  );
  const foreign = new Set(
    rows.filter((r) => String(r.user_id) !== userId).map((r) => String(r.id))
  );
  return new Set(ids.filter((id) => !foreign.has(id)));
}

async function readAttached(
  sourceId: string,
  ownerUserId: string,
  readable: ReadonlySet<string>,
  deps: AttachedDocDeps
): Promise<SourceText | { error: string }> {
  if (!readable.has(sourceId)) return { error: NOT_READABLE };
  const source = await readSourceText({ sourceId, ownerUserId }, deps);
  return source.text.trim() ? source : { error: NOT_READABLE };
}

/**
 * Die Texte der angehängten Dokumente samt chunkMap — nur eigene, nur die des
 * Turns. Ein fremdes oder fehlendes Dokument zählt als „nicht lesbar" und macht
 * das Ergebnis unvollständig, statt still zu fehlen.
 */
export async function loadAttachedTexts(
  input: { userId: string | null; sources: readonly DocumentSource[] },
  deps: AttachedDocDeps
): Promise<ScanLoad | { error: string }> {
  const { userId, sources } = input;
  if (!userId || sources.length === 0) return { error: NONE_READABLE };
  const readable = await readableIds(userId, sources, deps.db);
  const labelById = new Map(sources.map((s) => [s.id, s.label] as const));
  const read = await readScanSources(
    sources.map((s) => s.id),
    async (sourceId) => {
      const source = await readAttached(sourceId, userId, readable, deps);
      if ('error' in source) return source;
      return {
        title: labelById.get(sourceId) ?? 'Dokument',
        text: source.text,
        chunkMap: source.chunkMap,
      };
    },
    { budget: SCAN_CHAR_BUDGET, explicit: sources.length === 1 }
  );
  if ('error' in read) return read;
  if (read.sources.length === 0) return { error: NONE_READABLE };
  const reason = incompleteReason(read.tooLarge, read.unreadable, sources.length === 1);
  return { sources: read.sources, exhaustive: reason === null, incompleteReason: reason };
}

function located(id: string, title: string, content: string): SearchResult {
  return { source: `documentchat:${id}`, title, content, relevance: 1, documentSourceId: id };
}

/**
 * Volltext in Scheiben (`abschnitt`), statt Ähnlichkeitssuche.
 *
 * Über denselben Loader wie `seite`, `wortsuche` und `zitat`: die Offsets im
 * Wegweiser und in deren Fundstellen zeigen damit in DENSELBEN Text
 * (`markdown_content`, sonst die aneinandergereihten Chunks). Vorher las
 * `abschnitt` über `getMultipleDocumentsFullText` — andere Verkettung, 20
 * Chunks je Dokument — und ein `abschnitt.von` aus einem Seiten-Wegweiser
 * landete an der falschen Stelle.
 *
 * Der Ausweg für Fragen, die keine brauchbare Suchanfrage hergeben (Open WebUIs
 * `view_file`, LobeHubs `readKnowledge`). Für „fasse zusammen" ist trotzdem
 * `summarize` der richtige Weg — Map-Reduce über den ganzen Text, nicht dessen
 * erste Scheibe.
 */
export async function readAttachedSlice(
  input: {
    userId: string | null;
    sources: readonly DocumentSource[];
    from: number;
    chars?: number | undefined;
  },
  partialDeps?: Partial<AttachedDocDeps>
): Promise<SearchResult[]> {
  const { userId, sources } = input;
  if (!userId || sources.length === 0) return [];
  const deps = await resolveDeps(partialDeps);
  const readable = await readableIds(userId, sources, deps.db);
  const results: SearchResult[] = [];
  for (const doc of sources) {
    const source = await readAttached(doc.id, userId, readable, deps);
    if ('error' in source) continue;
    const s = sliceSource(source.text, { von: input.from, zeichen: input.chars }, source.chunkMap);
    if (!s.slice) continue;
    // Der Wegweiser ist der einzige Weg, auf dem das Modell erfährt, dass noch
    // etwas kommt. Er steht VORN: gekappt wird immer der Schwanz (in
    // `applyContextCap` und in der gemeinsamen Schrumpfung von `renderAll`).
    const marker =
      s.to < s.total
        ? `[Zeichen ${s.from}–${s.to} von ${s.total} — weiter mit abschnitt.von=${s.to}]`
        : `[Zeichen ${s.from}–${s.to} von ${s.total} — Ende des Dokuments]`;
    results.push({
      ...located(doc.id, doc.label, `${marker}\n\n${s.slice}`),
      ...(s.pageRange ? { pageNumber: s.pageRange.from, pageTo: s.pageRange.to } : {}),
    });
  }
  return results;
}

export async function runAttachedDocumentMode(
  args: AttachedDocModeArgs,
  ctx: AttachedDocCtx
): Promise<Record<string, unknown>> {
  const deps = await resolveDeps(ctx.deps);
  if (args.seite !== undefined) return readPage(args.seite, ctx, deps);
  if (args.wortsuche !== undefined) return grepAttached(args.wortsuche, ctx, deps);
  if (args.zitat !== undefined) return citeAttached(args.zitat, ctx, deps);
  return { error: 'Kein Modus angegeben.' };
}

async function readPage(
  seite: number,
  ctx: AttachedDocCtx,
  deps: AttachedDocDeps
): Promise<Record<string, unknown>> {
  const [doc, ...rest] = ctx.sources;
  if (!doc) return { error: NONE_READABLE };
  if (rest.length > 0) {
    return {
      error: `seite braucht dateiname, wenn mehrere Dateien angehängt sind: ${ctx.sources.map((s) => s.label).join(', ')}`,
    };
  }
  if (!ctx.userId) return { error: NOT_READABLE };
  const readable = await readableIds(ctx.userId, [doc], deps.db);
  const source = await readAttached(doc.id, ctx.userId, readable, deps);
  if ('error' in source) return source;

  const range = pickRange({ seite }, source.chunkMap, source.chunks, source.text);
  // `chunks` ist ein Parameter von `notebook_quellen`, nicht von diesem Werkzeug.
  if ('error' in range) return { error: range.error.replace(' oder chunks{from,to}', '') };
  const s = sliceSource(source.text, range, source.chunkMap);
  const pageEnd = range.von + (range.zeichen ?? s.slice.length);
  const pageLabel =
    s.pageRange && s.pageRange.to > s.pageRange.from
      ? `Seite ${s.pageRange.from}–${s.pageRange.to}`
      : `Seite ${seite}`;
  // Vorn, nicht hinten: gekappt wird der Schwanz (wie in `readAttachedSlice`).
  const marker =
    s.to < pageEnd
      ? `[${pageLabel}, Zeichen ${s.from}–${s.to} von ${s.total} — die Seite geht weiter mit abschnitt.von=${s.to}]`
      : `[${pageLabel}, Zeichen ${s.from}–${s.to} von ${s.total}]`;
  const sources = ctx.sourceRegistry.register(
    [
      {
        ...located(doc.id, doc.label, `${marker}\n\n${s.slice}`),
        pageNumber: s.pageRange?.from ?? seite,
        pageTo: s.pageRange?.to ?? seite,
        charStart: s.from,
        charEnd: s.to,
        citedText: s.slice,
      },
    ],
    { snippetChars: SLICE_REGISTER_CHARS }
  );
  return {
    datei: doc.label,
    seite,
    pageRange: s.pageRange,
    from: s.from,
    to: s.to,
    total: s.total,
    resultCount: 1,
    sources,
  };
}

async function grepAttached(
  wortsuche: NonNullable<AttachedDocModeArgs['wortsuche']>,
  ctx: AttachedDocCtx,
  deps: AttachedDocDeps
): Promise<Record<string, unknown>> {
  const phrase = wortsuche.phrase.trim();
  if (phrase.length < 2) return { error: 'wortsuche braucht phrase (mindestens 2 Zeichen).' };
  const loaded = await loadAttachedTexts({ userId: ctx.userId, sources: ctx.sources }, deps);
  if ('error' in loaded) return loaded;
  const { totalHits, perSource } = grepSources(loaded.sources, phrase, {
    caseSensitive: wortsuche.grossKlein,
    contexts: GREP_CONTEXTS,
  });
  const shown = shownGrepSources(perSource, undefined);
  const incomplete = loaded.exhaustive ? null : notExhaustiveGrep(loaded.incompleteReason);
  const reg = ctx.sourceRegistry;

  // Der Schreiber im split-Modus sieht die Rückgabe nicht — die Zählung muss
  // als Notiz zu ihm (wie `noteSummary` bei `notebook_quellen`).
  const perFile = perSource.map((s) => {
    const pages = [...new Set(s.contexts.map((c) => c.pageNumber).filter((p) => p !== null))];
    return `${s.title}: ${s.count}×${pages.length ? ` (u. a. S. ${pages.join(', ')})` : ''}`;
  });
  reg.note(
    `dokumente_lesen wortsuche — „${phrase}"`,
    [
      `totalHits: ${totalHits}`,
      `exhaustive: ${loaded.exhaustive ? 'ja' : 'nein'}`,
      `durchsucht: ${loaded.sources.length} Datei(en)`,
      ...perFile,
      ...(incomplete ? [incomplete] : []),
    ].join('; ')
  );

  const sources =
    shown.length > 0
      ? reg.register(
          shown.map((s): SearchResult => {
            const first = s.contexts[0];
            const lines = s.contexts.map(
              (c) => `${c.pageNumber !== null ? `S. ${c.pageNumber}: ` : ''}${c.text}`
            );
            return {
              ...located(s.sourceId, s.title, `${s.count}× „${phrase}"\n${lines.join('\n…\n')}`),
              ...(first
                ? {
                    charStart: first.charStart,
                    pageNumber: first.pageNumber,
                    citedText: first.text,
                  }
                : {}),
            };
          })
        )
      : null;
  return {
    phrase,
    exhaustive: loaded.exhaustive,
    totalHits,
    documentsScanned: loaded.sources.length,
    documentsWithHits: perSource.length,
    perSource: shown.map((s) => ({
      datei: s.title,
      count: s.count,
      fundstellen: s.contexts.map((c) => ({ seite: c.pageNumber, text: c.text })),
    })),
    ...(incomplete ? { note: incomplete } : {}),
    ...(sources ? { sources } : {}),
  };
}

async function citeAttached(
  zitat: string,
  ctx: AttachedDocCtx,
  deps: AttachedDocDeps
): Promise<Record<string, unknown>> {
  const quote = zitat.trim();
  if (!quote) return { error: 'zitat braucht den Wortlaut.' };
  const loaded = await loadAttachedTexts({ userId: ctx.userId, sources: ctx.sources }, deps);
  if ('error' in loaded) return loaded;
  const out = locateQuoteInSources(loaded, quote);
  const reg = ctx.sourceRegistry;

  if (out.found) {
    const befund = out.method === 'fuzzy' ? 'ungefähr' : 'gefunden';
    const sources = reg.register([
      {
        ...located(out.sourceId, out.title, out.context),
        pageNumber: out.pageNumber,
        charStart: out.charStart,
        charEnd: out.charEnd,
        citedText: out.matched,
      },
    ]);
    return {
      befund,
      method: out.method,
      datei: out.title,
      seite: out.pageNumber,
      matched: out.matched,
      context: out.context,
      exhaustive: out.exhaustive,
      ...(befund === 'ungefähr'
        ? {
            note: 'Nicht wörtlich — das ist die ähnlichste Stelle. Zitiere den Wortlaut aus matched.',
          }
        : {}),
      sources,
    };
  }
  if (out.candidates.length > 0) {
    const sources = reg.register(
      out.candidates.map((c) => ({
        ...located(c.sourceId, c.title, c.sentence),
        pageNumber: c.pageNumber,
        charStart: c.charStart,
        charEnd: c.charEnd,
        citedText: c.sentence,
      }))
    );
    return {
      befund: 'gefunden',
      candidates: out.candidates.map((c) => ({
        datei: c.title,
        seite: c.pageNumber,
        text: c.sentence,
      })),
      note: 'Das Zitat steht in mehreren Dateien — nenne die gemeinte oder frage nach.',
      sources,
    };
  }
  const missing = out.exhaustive
    ? `Das Zitat „${quote}" steht so in keinem der angehängten Dokumente.`
    : `Das Zitat „${quote}" steht in keinem der gelesenen Dokumente — nicht alle wurden gelesen (${out.incompleteReason ?? 'unvollständig'}).`;
  reg.note('dokumente_lesen zitat', missing);
  return { befund: 'nicht gefunden', exhaustive: out.exhaustive, note: missing };
}

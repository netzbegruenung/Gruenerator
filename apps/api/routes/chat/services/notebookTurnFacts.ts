/**
 * Fakten über den ganzen Bestand, vorab berechnet für den Chatmodus — ohne
 * Modell. Was berechnet wird, entscheidet `notebookTurnNeeds.ts`:
 *
 * - Zählung: dieselbe wörtliche Suche wie `notebook_quellen grep`
 *   (`loadScanTexts` + `grepSources`), über ALLE Quellen der eigenen Notebooks.
 *   Liest der Scan nicht alles (`exhaustive: false`), sagt der Block das, damit
 *   keine Teilzahl als Gesamtzahl erscheint.
 * - Seite: der Text zwischen den `## Seite N`-Marken des gespeicherten Texts.
 *
 * Ein Fehler kostet nur die Fakten, nie die Antwort.
 */
import { isUserNotebookId } from '../../../config/notebookCollectionMap.js';
import {
  markedPageRanges,
  readSourceText,
  resolveSourceInNotebook,
  type ResolvedSource,
} from '../../../services/notebook/notebookSources.js';
import {
  grepSources,
  loadScanTexts,
  type ScanLoad,
} from '../../../services/notebook/sourceGrep.js';
import { createLogger } from '../../../utils/logger.js';
import { defaultNotebookSourceDeps } from '../agents/notebookSourceTools.js';

import type { NotebookTurnNeeds } from './notebookTurnNeeds.js';

const log = createLogger('NotebookTurnFacts');

/** Quellen je Begriff in der Liste; die Summen zählen alle. */
const SOURCES_SHOWN = 10;
/** Deckel für eine Seite im Prompt — eine Seite ist selten länger. */
const PAGE_MAX_CHARS = 8000;

export interface TurnFactsDeps {
  loadTexts: (
    collectionId: string,
    userId: string,
    prefilterQuery: string
  ) => Promise<ScanLoad | { error: string }>;
  resolveSource: (
    collectionId: string,
    sourceId: string,
    userId: string
  ) => Promise<ResolvedSource>;
  readText: (sourceId: string, ownerUserId: string) => Promise<string>;
}

function defaultDeps(): TurnFactsDeps {
  const deps = defaultNotebookSourceDeps();
  return {
    loadTexts: (collectionId, userId, prefilterQuery) =>
      loadScanTexts({ collectionId, userId, prefilterQuery }, deps),
    resolveSource: (collectionId, sourceId, userId) =>
      resolveSourceInNotebook({ collectionId, sourceId, userId }, deps),
    readText: async (sourceId, ownerUserId) =>
      (await readSourceText({ sourceId, ownerUserId }, deps)).text,
  };
}

export interface TurnFacts {
  block: string;
  counted: boolean;
  pageRead: boolean;
}

const NONE: TurnFacts = { block: '', counted: false, pageRead: false };

async function countBlock(
  input: {
    terms: readonly string[];
    collectionIds: readonly string[];
    userId: string;
    documentIds: readonly string[] | null;
  },
  deps: TurnFactsDeps
): Promise<{ text: string; counted: boolean }> {
  if (input.terms.length === 0) {
    return { text: 'Es wurde nicht gezählt: kein Suchbegriff erkannt.', counted: false };
  }
  const loads = await Promise.all(
    input.collectionIds.map((id) => deps.loadTexts(id, input.userId, input.terms.join(' ')))
  );
  const ok = loads.filter((l): l is ScanLoad => !('error' in l));
  if (ok.length === 0) return { text: '', counted: false };
  const allowed = input.documentIds?.length ? new Set(input.documentIds) : null;
  const sources = ok.flatMap((l) => l.sources).filter((s) => !allowed || allowed.has(s.sourceId));
  const exhaustive = ok.length === loads.length && ok.every((l) => l.exhaustive);

  const head = exhaustive
    ? `Wörtliche Zählung (vollständig über alle ${sources.length} Quellen):`
    : 'Wörtliche Zählung (nicht alle Quellen gelesen — keine Gesamtzahl nennen):';
  const lines = input.terms.map((term) => {
    const { totalHits, perSource } = grepSources(sources, term, { contexts: 0 });
    if (perSource.length === 0) return `„${term}": in keiner Quelle`;
    const shown = perSource.slice(0, SOURCES_SHOWN).map((s) => `- ${s.title}: ${s.count}×`);
    const more =
      perSource.length > SOURCES_SHOWN ? [`- … ${perSource.length - SOURCES_SHOWN} weitere`] : [];
    const n = perSource.length;
    return [
      `„${term}": ${totalHits} Treffer in ${n} ${n === 1 ? 'Quelle' : 'Quellen'}`,
      ...shown,
      ...more,
    ].join('\n');
  });
  return { text: [head, ...lines].join('\n'), counted: true };
}

async function pageBlock(
  page: NonNullable<NotebookTurnNeeds['page']>,
  collectionIds: readonly string[],
  userId: string,
  deps: TurnFactsDeps
): Promise<{ text: string; read: boolean }> {
  for (const collectionId of collectionIds) {
    const resolved = await deps.resolveSource(collectionId, page.sourceId, userId);
    if (!resolved.ok) continue;
    const text = await deps.readText(page.sourceId, resolved.ownerUserId);
    const range = markedPageRanges(text).find((r) => r.page === page.page);
    if (!range) {
      return {
        text: `Seite ${page.page} von „${resolved.title}" ist im gespeicherten Text nicht zu finden.`,
        read: false,
      };
    }
    const body = text
      .slice(range.start, range.end)
      .replace(/^##\s*Seite\s+\d+\s*/, '')
      .trim()
      .slice(0, PAGE_MAX_CHARS);
    return {
      text: `Text von Seite ${page.page} aus „${resolved.title}" (wörtlich):\n<<<\n${body}\n>>>`,
      read: true,
    };
  }
  return { text: '', read: false };
}

export async function computeTurnFacts(
  input: {
    needs: NotebookTurnNeeds;
    terms: readonly string[];
    collectionIds: readonly string[];
    userId: string;
    documentIds: readonly string[] | null;
  },
  deps: TurnFactsDeps = defaultDeps()
): Promise<TurnFacts> {
  const own = input.collectionIds.filter((id) => isUserNotebookId(id));
  if (own.length === 0) return NONE;
  try {
    const [count, page] = await Promise.all([
      input.needs.count
        ? countBlock({ ...input, collectionIds: own }, deps)
        : Promise.resolve({ text: '', counted: false }),
      input.needs.page
        ? pageBlock(input.needs.page, own, input.userId, deps)
        : Promise.resolve({ text: '', read: false }),
    ]);
    const block = [count.text, page.text].filter(Boolean).join('\n\n');
    return { block, counted: count.counted, pageRead: page.read };
  } catch (err) {
    log.warn(
      `[NotebookTurnFacts] facts skipped: ${err instanceof Error ? err.message : String(err)}`
    );
    return NONE;
  }
}

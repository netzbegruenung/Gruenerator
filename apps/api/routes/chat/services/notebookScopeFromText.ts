/**
 * „Im Berlin-Notebook …" — ein im Text GENANNTES Notebook wird zum Notebook des
 * Turns, genau wie eine @-Erwähnung. Ohne das stand der Turn ohne Notebook da:
 * `notebook_quellen` scheiterte mit „Kein Notebook ausgewählt", und die Antwort
 * behauptete, die Funktion gebe es nicht (Live-Test 23.09.2026).
 *
 * Die Zuordnung ist eine Einbahnstraße — ein gescopter Turn sucht nur noch im
 * Notebook —, deshalb ist sie absichtlich eng:
 * - Das Wort „Notebook" (oder das alte „Notizbuch", nur hier im Detektor über
 *   Nutzereingaben) muss direkt am Namen stehen: „im Berlin-Notebook",
 *   „Berlin Notebook", „Notebook Berlin", „Notebook „Kreisverband Nord"".
 * - Ohne das Wort zählt nur der exakte volle Name eines EIGENEN Notebooks, nur
 *   ab zwei Wörtern (ein Einwort-Name wie „Klima" träfe sonst jede Inhaltsfrage
 *   zum Thema) und nur als Ort hinter „in/im/aus".
 * - Treffen zwei Notebooks, wird nicht gescoped.
 *
 * Kandidaten sind die System-Notebooks, die der Locale des Turns zustehen
 * (`collectionsForLocale`, dieselbe Menge wie bei `gruenerator_search` und
 * `notebook_quellen`) und genau EINE Sammlung haben — ein Mehr-Sammlungs-Notebook
 * („alle") kann `notebook_quellen` ohnehin nicht öffnen —, plus die eigenen
 * Notebooks des Kontos.
 *
 * `\b` ist neben Umlauten tot, deshalb Lookarounds — dasselbe Idiom wie
 * `agenturaContext.ts`.
 */
import { NOTEBOOK_REGISTRY } from '@gruenerator/shared/notebooks';

import {
  NOTEBOOK_COLLECTION_MAP,
  isNotebookImplicitlySearchable,
} from '../../../config/notebookCollectionMap.js';
import { createLogger } from '../../../utils/logger.js';
import { withTimeout } from '../../../utils/withTimeout.js';
import { collectionsForLocale } from '../agents/searchTools.js';

const log = createLogger('NotebookScope');

export interface NotebookNameCandidate {
  /** Notebook-Slug (`berlin-notebook`) oder UUID eines eigenen Notebooks. */
  id: string;
  names: readonly string[];
  /** Eigenes Notebook — nur hier zählt der volle Name ohne das Wort Notebook. */
  own: boolean;
}

const B = '(?<![\\wäöüß])';
const E = '(?![\\wäöüß])';
const NOTEBOOK_WORD = '(?:notebooks?|notizb(?:u|ü|ue)ch(?:e?s|er(?:n)?)?)';
const OPEN_QUOTE = '[„"»«\'‚“]?';
const CLOSE_QUOTE = '[“"«»\'‘”]?';

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Leerraum und Bindestrich im Namen sind austauschbar: „Kreisverband-Nord-Notebook". */
function namePattern(name: string): string {
  return name
    .trim()
    .split(/[\s-]+/)
    .map(escapeRe)
    .join('[\\s-]+');
}

function namedWithNotebookWord(name: string): RegExp {
  const n = namePattern(name);
  return new RegExp(
    `${B}(?:${OPEN_QUOTE}${n}${CLOSE_QUOTE}[\\s-]?${NOTEBOOK_WORD}|${NOTEBOOK_WORD}\\s+${OPEN_QUOTE}${n}${CLOSE_QUOTE})${E}`,
    'i'
  );
}

/** Nur als Ort: „in Kreisverband Nord", „aus meinem Kreisverband Nord" — sonst
 *  träfe ein Notebook namens „Die Grünen" jeden Satz, der so anfängt. Der Name
 *  selbst ist groß-/kleinschreibungsgenau. */
function namedExactly(name: string): RegExp {
  return new RegExp(
    `${B}(?:[Ii]m|[Ii]n|[Aa]us)(?:\\s+(?:dem|meinem|unserem))?\\s+${OPEN_QUOTE}${namePattern(name)}${CLOSE_QUOTE}${E}`
  );
}

/** Ort + Wort mit Großbuchstaben + ein weiteres Wort — die Form, die
 *  `namedExactly` für einen eigenen Namen ohne „Notebook" verlangt. */
const OWN_NAME_SHAPE = new RegExp(
  `${B}(?:[Ii]m|[Ii]n|[Aa]us)(?:\\s+(?:dem|meinem|unserem))?\\s+${OPEN_QUOTE}[A-ZÄÖÜ][\\wäöüß]*[\\s-]+[\\wäöüß]`
);
const NOTEBOOK_WORD_RE = new RegExp(`${B}${NOTEBOOK_WORD}${E}`, 'i');

/**
 * Kann dieser Text überhaupt ein eigenes Notebook nennen? Das billige Tor vor
 * der Qdrant-Liste: „Hallo" und die meisten Inhaltsfragen kosten dann nichts.
 */
export function mayNameOwnNotebook(text: string): boolean {
  return NOTEBOOK_WORD_RE.test(text) || OWN_NAME_SHAPE.test(text);
}

const wordCount = (name: string): number =>
  name
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean).length;

/** Die eine id, die der Text nennt — oder `null` bei keinem oder mehreren Treffern. */
export function findNotebookNamedInText(
  text: string | null,
  candidates: readonly NotebookNameCandidate[]
): string | null {
  if (!text?.trim()) return null;
  const hits = new Set<string>();
  for (const candidate of candidates) {
    for (const name of candidate.names) {
      if (!name.trim()) continue;
      if (
        namedWithNotebookWord(name).test(text) ||
        (candidate.own && wordCount(name) >= 2 && namedExactly(name).test(text))
      ) {
        hits.add(candidate.id);
        break;
      }
    }
  }
  return hits.size === 1 ? [...hits][0]! : null;
}

/** System-Notebooks, die dieser Turn beim Namen nennen darf. */
export function systemNotebookCandidates(locale: string | null): NotebookNameCandidate[] {
  const allowed = collectionsForLocale(locale);
  return NOTEBOOK_REGISTRY.filter((nb) => {
    const keys = NOTEBOOK_COLLECTION_MAP[nb.id] ?? [];
    return keys.length === 1 && allowed.includes(keys[0]!) && isNotebookImplicitlySearchable(nb.id);
  }).map((nb) => ({
    id: nb.id,
    names: [nb.title, nb.mention.title, nb.mention.alias],
    own: false,
  }));
}

// ── Eigene Notebooks: ein Scroll pro Konto und Minute, nicht pro Turn ────────

const OWN_TTL_MS = 60_000;
/** Ein Ausfall wird kurz gemerkt: sonst wartete bei langsamem Qdrant JEDER
 *  Turn ohne Auswahl die volle Frist vor dem ersten Token. */
const OWN_FAILURE_TTL_MS = 15_000;
/**
 * Die Liste läuft vor dem Klassifikator, also vor dem ersten Token. Hängt
 * Qdrant, fällt nur der Scope auf eigene Notebooks weg; System-Notebooks
 * treffen weiter.
 */
export const OWN_NOTEBOOK_LIST_TIMEOUT_MS = 1_500;
const ownCache = new Map<string, { expiresAt: number; notebooks: OwnNotebook[] }>();

interface OwnNotebook {
  id: string;
  name: string;
}

/** Nur für Tests: den Prozess-Cache leeren. */
export function resetOwnNotebookNameCache(): void {
  ownCache.clear();
}

/** Nur für Tests: wie viele Konten der Cache gerade hält. */
export function ownNotebookNameCacheSize(): number {
  return ownCache.size;
}

/** Schreibt und räumt dabei Abgelaufenes weg — sonst wüchse die Map mit
 *  jedem Konto, das der Prozess je gesehen hat. */
function remember(userId: string, notebooks: OwnNotebook[], ttlMs: number): void {
  const now = Date.now();
  for (const [key, entry] of ownCache) {
    if (entry.expiresAt <= now) ownCache.delete(key);
  }
  ownCache.set(userId, { expiresAt: now + ttlMs, notebooks });
}

async function listOwnNotebooksDefault(userId: string): Promise<OwnNotebook[]> {
  // Lazy wie in `resolveUserNotebookDocumentIds`: der Helfer baut beim Laden
  // seinen Qdrant-Client.
  const { NotebookQdrantHelper } =
    await import('../../../database/services/NotebookQdrantHelper.js');
  const collections = await new NotebookQdrantHelper().getUserNotebookCollectionsLight(userId);
  return collections.map((c) => ({ id: c.id, name: c.name }));
}

async function ownNotebooks(
  userId: string,
  listOwn: (userId: string) => Promise<OwnNotebook[]>
): Promise<OwnNotebook[]> {
  const hit = ownCache.get(userId);
  if (hit && Date.now() < hit.expiresAt) return hit.notebooks;
  try {
    const notebooks = await withTimeout(
      listOwn(userId),
      OWN_NOTEBOOK_LIST_TIMEOUT_MS,
      'own notebook names'
    );
    remember(userId, notebooks, OWN_TTL_MS);
    return notebooks;
  } catch (err) {
    remember(userId, [], OWN_FAILURE_TTL_MS);
    log.warn('own notebook list failed', err);
    return [];
  }
}

/**
 * Das Notebook, das der Text nennt, als id für `notebookIds` — oder `null`.
 * Der Aufrufer ruft das nur, wenn der Turn KEIN Notebook gewählt oder erwähnt
 * hat; die eigenen Notebooks laufen danach durch dieselbe Besitzprüfung wie
 * eine Erwähnung (`resolveUserNotebookDocumentIds`).
 */
export async function resolveNotebookScopeFromText(params: {
  userId: string;
  text: string;
  locale: string | null;
  listOwn?: (userId: string) => Promise<OwnNotebook[]>;
}): Promise<string | null> {
  const { userId, text, locale, listOwn = listOwnNotebooksDefault } = params;
  if (!text.trim()) return null;
  const own = mayNameOwnNotebook(text) ? await ownNotebooks(userId, listOwn) : [];
  const id = findNotebookNamedInText(text, [
    ...systemNotebookCandidates(locale),
    ...own.map((nb) => ({ id: nb.id, names: [nb.name], own: true })),
  ]);
  if (id) log.info(`from text: ${id}`);
  return id;
}

/**
 * Die Notebook-ids des Turns: gewählte/erwähnte gewinnen; nur ohne jede Auswahl
 * (auch kein Standard-Notebook im Composer) zählt ein im Text genanntes.
 */
export async function notebookIdsForTurn(params: {
  explicitIds: string[];
  hasDefaultNotebook: boolean;
  userId: string;
  text: string;
  locale: string | null;
  listOwn?: (userId: string) => Promise<OwnNotebook[]>;
}): Promise<string[]> {
  const { explicitIds, hasDefaultNotebook, ...rest } = params;
  if (explicitIds.length > 0 || hasDefaultNotebook) return explicitIds;
  const id = await resolveNotebookScopeFromText(rest);
  return id ? [id] : [];
}

/**
 * Per-turn source accumulator for the agentic loop.
 *
 * Search-family tools push their raw results here as they run. The registry
 * keeps a stable, de-duplicated ordering and is the SINGLE source of the `[N]`
 * numbering: the model is shown numbered snippets (`[N] title — snippet`), and
 * `getCitations()` projects citations in the SAME order with the SAME ids.
 *
 * Critically it does NOT delegate numbering to `buildCitations` — that function
 * groups by document, re-sorts by relevance and caps at `MAX_SOURCES` (20),
 * none of which preserve the incremental order the model cited against. Instead we project
 * each already-numbered result individually (reusing `buildCitations` per item
 * for the projection shape only) and stamp the registry index as the id. Empty-
 * content results are skipped at register time so a numbered snippet always maps
 * to a real citation (buildCitations drops empty-content sources — skipping them
 * up front keeps `[N]` in lockstep).
 */
import { buildCitations } from '../../../../agents/langgraph/ChatGraph/nodes/citationUtils.js';
import { applyContextCap } from '../../../../utils/contextCap.js';
import { INSTRUCTION_HIERARCHY_RULE, embedUntrusted } from '../untrustedContent.js';

import type { Citation, SearchResult } from '../../../../agents/langgraph/ChatGraph/types.js';

/**
 * How much of each result's content the model sees per snippet line. It's the
 * only grounding text the model gets — the tool return drops the raw content —
 * so this number IS the retrieval quality ceiling.
 *
 * 320 was below our own chunk size: documents are indexed at 400-500 tokens
 * (~1400-1750 chars), so we embedded, stored and searched a chunk and then
 * showed the model a quarter of it. Numeric and tabular answers landed just
 * past the cut, and the model reported "dazu steht nichts in den Quellen"
 * while the citation chip pointed at the right document.
 *
 * 1500 covers a whole chunk. For reference, neither Open WebUI nor LobeChat
 * truncates a retrieved source at all — they bound retrieval by COUNT
 * (top_k 3 / 30 items) and let the chunk size do the limiting.
 *
 * Tools with longer prose can still raise it per registration (`snippetChars`).
 *
 * Nachtrag 24.08.2026: „1500 covers a whole chunk" stimmte hier, aber nicht am
 * Eingang — die Suche hatte jeden Chunk vorher auf `CONTENT_MAX_EXCERPT_LENGTH`
 * = 300 Zeichen geschnitten, also kam nie ein ganzer Chunk an, den diese Zahl
 * hätte abdecken können. Gemessen: 21 118 Zeichen Dokument → 3000 (10 × 300)
 * → 1500, macht 7 %. Der untere Deckel steht jetzt bei 1500 und wird von
 * `searchExcerptBudget.vitest.ts` an der Chunk-Größe festgehalten. Wer diese
 * Zahl hier ändert, prüft die andere mit — allein wirkt keine von beiden.
 */
const SNIPPET_CHARS = 1500;

/**
 * Budget for the WHOLE source block handed to the synth, across all sources.
 *
 * Sized against the ONE turn that legitimately needs the most: `tiefenrecherche`
 * returns 20 hits, of which the loop reads the top 3 (see `toolCatalog`), so
 * 3×4000 + 17×1500 = 37 500 is the largest block a single search can honestly
 * produce. 38k covers it exactly.
 *
 * The old 18k predates both. It was set when 12 sources at 1500 was the widest
 * case, and it silently undid the two changes made since: a `tiefenrecherche`
 * turn at 20×1500 = 30k already tripped the shared shrink and was handed back
 * 900 chars per source — so the deep tier's raised snippet budget never once
 * reached the model, and a crawl added on top would have been shrunk away at
 * the same step.
 *
 * Not a context-window constraint at either value: 38k ≈ 10 900 tokens is 9 % of
 * the smallest synth lane (`CTX_VERDIGADO` 120k) and 4 % of Mistral's 262k. What
 * it bounds is unbounded GROWTH — carried sources are re-seeded every turn, so
 * without a ceiling a long research thread grows the synth prompt forever. That
 * backstop is intact: at most 10 carried (`getRecentThreadSources`) plus 20 fresh
 * is 45k, still above this, so the shrink still fires where it was meant to.
 * Above the budget every source keeps its number and its line and they shorten
 * together — see `renderAll`.
 */
const SOURCE_BLOCK_CHARS = 38_000;

/** Floor for the shared cap. Below this a snippet stops being evidence and
 *  becomes a headline, and the model starts reporting "dazu steht nichts in den
 *  Quellen" — the failure SNIPPET_CHARS was raised to 1500 to fix. */
const MIN_SNIPPET_CHARS = 500;

const contentLength = (e: { result: SearchResult }): number => (e.result.content ?? '').length;

export interface SourceRegistry {
  /** Add raw results (search/web/research/examples). Returns the numbered
   *  snippet block for exactly the newly-added results so the calling tool can
   *  hand it back to the model. `snippetChars` raises the per-line content cap
   *  for these results (default 320) — honored in `renderAll` too. */
  register(results: SearchResult[], opts?: { snippetChars?: number }): string;
  /**
   * Seed sources gathered in EARLIER turns (cross-turn rehydration).
   *
   * Numbered and citable exactly like this turn's own results. They used to be
   * a separate UNNUMBERED block with the model explicitly forbidden to mark
   * them — which made the SAME follow-up citable or uncitable depending only on
   * whether the turn happened to route through the loop or the single-pass
   * path (`carryThreadSourcesIfNeeded` cites them). The user-visible effect was
   * an answer that read as researched and pointed at nothing.
   *
   * The original worry — a `[N]` chip the UI cannot back — does not apply:
   * carried sources are projected into `getCitations()` and re-persisted via
   * `getResults()` just like fresh ones, so every marker has a chip and every
   * chip has a row. What they must NOT do is count as this turn's research:
   * `freshSize` (not `size`) is what the loop guards budget against.
   *
   * Order matters only in that the numbering is positional — seeded first, they
   * occupy the low numbers, and `register()` continues from there.
   */
  seedCarried(results: SearchResult[]): void;
  /**
   * Der Vorab-Abruf der angehängten Dokumente (`seedAttachedDocuments`).
   *
   * Zitierbar und in der Numerierung wie jede andere Quelle dieses Turns — der
   * Schreiber soll sie belegen können. Aber NICHT die Recherche des Planers:
   * die Wächter budgetieren gegen `freshSize`, und beide Stellen, die das tun,
   * urteilen über SEIN Verhalten. `emptyResultFallback` erzwingt die Websuche
   * genau dann, wenn die interne Suche gelaufen und leer geblieben ist — mit
   * den geseedeten Passagen im Zähler bliebe sie aus, obwohl der Planer nichts
   * gefunden hat. Und `checkSearchBudget` deckelt bei `MAX_SOURCES` (20): zwölf
   * geseedete Chunks nähmen 60 % davon weg, bevor der erste Aufruf läuft.
   *
   * Findet der Planer denselben Chunk später selbst, zählt er ab dann als seine
   * Recherche — dieselbe Regel wie bei `prior`.
   *
   * `snippetChars` deckelt wie bei `register` — der Aufrufer reicht
   * `ATTACHED_DOC_SNIPPET_CHARS` durch; ohne Angabe gilt das Standardmass.
   */
  seedAttached(results: SearchResult[], snippetChars?: number): string;
  /**
   * A per-turn OUTCOME line: a write happened, a confirmation was requested, a
   * lookup came back empty. The split-mode synth sees no tool returns, so this
   * is its only channel for "what actually happened" — but it is NOT a source.
   *
   * Kept out of the numbered entries (and therefore out of citations, persistence and
   * `renderReference`) because it used to be in: a Kanban confirmation line
   * registered as a source, was persisted as this turn's `searchResults`, and a
   * later "mach ein PDF draus" was briefed with it as the only research in
   * scope. The generated PDF's entire content was that log line, cited as [1].
   */
  note(title: string, content: string): void;
  /** Prior-turn sources currently seeded (drives the honesty note). */
  readonly carriedSize: number;
  /** Was der PLANER diesen Turn selbst geholt hat. Die Wächter budgetieren
   *  dagegen, nicht gegen `size` — weder mitgeführte Recherche (`prior`) noch
   *  der Vorab-Abruf der Anhänge (`seeded`) sind seine Arbeit. Zählte man sie
   *  mit, bekäme ein Folge-Turn gesagt, er habe „schon genug gefunden", und die
   *  Websuche bliebe aus. */
  readonly freshSize: number;
  /** All accumulated results (capped) for persistence/UI — this turn's first, so
   *  a long carry can never push fresh research out of the capped slice. */
  getResults(limit?: number): SearchResult[];
  /** The full numbered snippet block for ALL accumulated results — injected into
   *  the synthesizer's context in the planner/executor split (the synth model
   *  has no tools, so it can't see results via tool returns). Carried
   *  (prior-turn) sources sit in the same numbering, marked as such. */
  renderAll(): string;
  /**
   * Numbered snippet block of carried (prior-turn) + this-turn sources, deduped —
   * the grounding reference handed to the edit op-planner so a "trag die Zahlen
   * ein" turn sees the research even when the search ran turns ago. Falls back to
   * this turn's sources only when nothing was carried.
   */
  renderReference(): string;
  /** Citations over all accumulated results — numbering matches the snippets. */
  getCitations(): Citation[];
  readonly size: number;
}

function resultKey(r: SearchResult): string {
  return `${r.url ?? ''}::${r.title ?? ''}::${(r.content ?? '').slice(0, 80)}`;
}

/**
 * Numbered source block for results that never went through a registry — the
 * single-pass create turns, which have no loop and therefore no registry, read
 * their prior research straight from the thread. Same line shape as the loop's
 * blocks so the artifact prompts only ever have to recognise one format.
 */
export function renderSourceLines(results: SearchResult[], cap = SNIPPET_CHARS): string {
  return results
    .filter((r) => (r.content ?? '').trim())
    .map((r, i) => snippetLine(i + 1, r, cap))
    .join('\n');
}

/**
 * Appends a numbered source block to a generation brief. The single place that
 * phrases it, so the artifact prompts (PDF/deck/sheet) can match on the exact
 * shape they're told to expect. Returns the brief unchanged when there is
 * nothing to append.
 */
export function withResearchedSources(brief: string, sourcesBlock: string): string {
  if (!sourcesBlock.trim()) return brief;
  // A brief is a bare user message to a generator that has no system prompt of
  // ours — so when the block arrives delimited (renderAll), the delimiter has to
  // arrive with its meaning attached. Callers passing an undelimited block
  // (renderReference, renderSourceLines) get the old wording unchanged.
  const rule = sourcesBlock.includes('<untrusted_content') ? INSTRUCTION_HIERARCHY_RULE : '';
  return `${brief}\n\nNutze diese recherchierten Quellen für die Inhalte:\n${sourcesBlock}${rule}`;
}

/** ISO timestamp → `YYYY-MM-DD`, or '' when the source carries no usable date.
 *  Day precision on purpose: an hour in a snippet line reads like data we do
 *  not have. */
function publishedDay(r: SearchResult): string {
  const raw = r['publishedDate'];
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

// The URL and the publication date are part of the line because this block is
// the ONLY view of a source any writing model gets.
//
// Without the URL an artifact tool (PDF, deck, sheet) can cite `[N]` but is
// structurally unable to reproduce the original link — "erstelle ein PDF mit den
// Originalquellen" then yields placeholder URLs. `[N]` stays the citation
// marker; the URL is the payload behind it.
//
// Without the date the model cannot tell a 2023 page from last week's, so a
// stale "ist Bundesminister" arrives looking exactly as current as the
// correction — which is how an answer reported a mandate given up months
// earlier. The ranking already reads `publishedDate` (recencyBoost); showing it
// closes the gap between what ranks the sources and what writes the answer.
function snippetLine(index: number, r: SearchResult, cap = SNIPPET_CHARS, prior = false): string {
  const title = (r.title || r.source || 'Quelle').trim();
  const body = applyContextCap(
    (r.content ?? '').replace(/\s+/g, ' ').trim(),
    cap,
    'sourceRegistry:snippet',
    false
  );
  const url = typeof r.url === 'string' && r.url.trim() ? ` <${r.url.trim()}>` : '';
  const day = publishedDay(r);
  const date = day ? ` (${day})` : '';
  const mark = prior ? ' (frühere Recherche)' : '';
  return `[${index}]${mark} ${title}${url}${date}${body ? ` — ${body}` : ''}`;
}

/** One entry per source. `prior` is the ONLY thing separating a carried source
 *  from a fresh one — position in this array IS the citation number, so no call
 *  order can desync the model's `[N]` from the chips. */
interface Entry {
  result: SearchResult;
  cap: number;
  prior: boolean;
  /** Aus dem Vorab-Abruf der Anhänge, nicht aus einem Werkzeugaufruf des
   *  Planers. Zitierbar wie jede Quelle, aber aus `freshSize` heraus. */
  seeded: boolean;
}

export function createSourceRegistry(): SourceRegistry {
  const entries: Entry[] = [];
  const indexByKey = new Map<string, number>();
  // Per-turn outcome lines (see `note`). Never sources.
  const notes: string[] = [];

  /** Returns the 1-based number of the entry, whether newly added or already
   *  present. A search that re-finds a carried source must still SHOW it to the
   *  model — under its established number, not as a second chip for one URL. */
  const add = (r: SearchResult, cap: number, prior: boolean, seeded = false): number | null => {
    if (!r || typeof r !== 'object') return null;
    // Skip empty-content results: buildCitations drops them, so numbering
    // them here would desync the model's [N] from done.citations.
    if ((r.content ?? '').trim().length === 0) return null;
    const key = resultKey(r);
    const existing = indexByKey.get(key);
    if (existing !== undefined) {
      const entry = entries[existing - 1];
      // A tool with longer prose may re-find a source registered under the
      // default cap — widen rather than show it truncated.
      if (entry && cap > entry.cap) entry.cap = cap;
      // Re-found by a search THIS turn: it is no longer only prior research,
      // so it drops the marker and starts counting toward `freshSize`.
      if (entry && !prior) entry.prior = false;
      // Dasselbe für den Vorab-Abruf: hat der Planer denselben Chunk selbst
      // gefunden, ist er ab jetzt seine Recherche und zählt für die Wächter.
      if (entry && !seeded) entry.seeded = false;
      return existing;
    }
    entries.push({ result: r, cap, prior, seeded });
    indexByKey.set(key, entries.length);
    return entries.length;
  };

  return {
    register(results, opts) {
      const cap = opts?.snippetChars ?? SNIPPET_CHARS;
      const lines: string[] = [];
      const emitted = new Set<number>();
      for (const r of results) {
        const index = add(r, cap, false);
        if (index === null || emitted.has(index)) continue;
        emitted.add(index);
        lines.push(snippetLine(index, r, cap));
      }
      return lines.join('\n');
    },
    seedCarried(results) {
      for (const r of results) add(r, SNIPPET_CHARS, true);
    },
    seedAttached(results, snippetChars) {
      const cap = snippetChars ?? SNIPPET_CHARS;
      const lines: string[] = [];
      const emitted = new Set<number>();
      for (const r of results) {
        const index = add(r, cap, false, true);
        if (index === null || emitted.has(index)) continue;
        emitted.add(index);
        lines.push(snippetLine(index, r, cap));
      }
      return lines.join('\n');
    },
    note(title, content) {
      const line = `${(title || 'Vorgang').trim()} — ${(content ?? '').replace(/\s+/g, ' ').trim()}`;
      if (!notes.includes(line)) notes.push(line);
    },
    getResults(limit = 10) {
      // This turn's own research first: a thread carrying ten prior sources
      // would otherwise fill the persisted slice before a single fresh result
      // reached it, and the next turn would rehydrate the same stale set.
      const fresh = entries.filter((e) => !e.prior).map((e) => e.result);
      const prior = entries.filter((e) => e.prior).map((e) => e.result);
      return [...fresh, ...prior].slice(0, limit);
    },
    renderAll() {
      // Total budget across ALL sources, not a per-source cap.
      //
      // `register` bounds each source at SNIPPET_CHARS but nothing bounded the
      // COUNT, so the block grew linearly: 10 sources ≈ 15k chars, 18 ≈ 27k, and
      // a long research thread keeps accumulating because carried sources are
      // seeded on every loop turn. The reference implementations this file
      // already cites (Open WebUI, LobeChat) bound retrieval by count instead.
      //
      // Dropping sources is what we must NOT do: `renderReference` promises the
      // same numbering, `buildCitations` numbers the chips in this order, and a
      // missing entry silently shifts every later [N] onto the wrong source.
      // So every source keeps its number and its line — they just get shorter
      // together once the block would exceed the budget. Below the budget
      // nothing changes at all.
      //
      // The shrink is class-aware, because a uniform one inverts the point of
      // reading a page. Measured live on a two-round `tiefenrecherche` turn (34
      // sources, 6 of them crawled): a flat cap of 38 000/34 = 1117 took 72 % off
      // each read page and 25 % off each snippet — the deep tier spent seconds
      // fetching six pages and then handed the model less of them than of the
      // snippets it already had. Worse, a digest is assembled in DOCUMENT order,
      // so a head cut on it keeps the earliest selected passages rather than the
      // best ones (the same defect `respondNode` fixes by dropping the weakest).
      //
      // So the snippets give way first, down to the evidence floor. Only if that
      // is still not enough does everything shrink together, as before.
      const capFor = (() => {
        const need = (e: Entry) => Math.min(e.cap, contentLength(e));
        const total = entries.reduce((sum, e) => sum + need(e), 0);
        if (total <= SOURCE_BLOCK_CHARS || entries.length === 0) return null;

        const read = entries.filter((e) => e.result.crawled === true);
        const snips = entries.filter((e) => e.result.crawled !== true);
        const readNeed = read.reduce((sum, e) => sum + need(e), 0);
        const snippetBudget = SOURCE_BLOCK_CHARS - readNeed;
        if (
          read.length > 0 &&
          snips.length > 0 &&
          snippetBudget >= snips.length * MIN_SNIPPET_CHARS
        ) {
          const snippetCap = Math.floor(snippetBudget / snips.length);
          return (e: Entry) => (e.result.crawled === true ? e.cap : snippetCap);
        }
        const uniform = Math.max(
          MIN_SNIPPET_CHARS,
          Math.floor(SOURCE_BLOCK_CHARS / entries.length)
        );
        return () => uniform;
      })();
      // Retrieved snippets are third-party text — a scraped page, a web result,
      // an MCP server's return — and go into the prompt as DATA, delimited the
      // same way the single-pass path delimits search results (respondNode).
      // Without this the loop was the one lane where a page saying "SYSTEM-
      // HINWEIS: ignoriere alle Regeln" arrived structurally indistinguishable
      // from an actual system rule. The notes and the provenance line below are
      // OUR statements about the turn, so they stay outside the wrapper.
      const snippets = entries
        .map((e, i) => snippetLine(i + 1, e.result, Math.min(e.cap, capFor?.(e) ?? e.cap), e.prior))
        .join('\n');
      const current = snippets ? embedUntrusted('suchergebnis', snippets) : '';
      // Unnumbered and explicitly labelled: the synth must be able to REPORT
      // what happened without ever treating it as retrieved material.
      const notesBlock =
        notes.length > 0
          ? `VORGÄNGE IN DIESEM TURN (was passiert ist — KEINE Quellen: nicht mit [N] zitieren und nicht als Inhalt für Dokumente verwenden):\n${notes
              .map((n) => `- ${n}`)
              .join('\n')}`
          : '';
      // Marked, not fenced off: the model may cite them, but a sentence like
      // "meine Recherche ergab" about a source found three turns ago is the
      // dishonesty this note prevents.
      const priorNote = entries.some((e) => e.prior)
        ? 'Mit „(frühere Recherche)" markierte Quellen stammen aus einem früheren Turn dieses Gesprächs — zitierbar wie die übrigen, aber behaupte NICHT, sie gerade gefunden zu haben.'
        : '';
      return [current, priorNote, notesBlock].filter((p) => p).join('\n\n');
    },
    renderReference() {
      // Same numbering as renderAll, without the per-line provenance marker:
      // this block briefs artifact/edit generators, and "(frühere Recherche)"
      // pasted into a source list is text inside the finished document.
      const lines = entries.map((e, i) => snippetLine(i + 1, e.result, e.cap)).join('\n');
      if (!lines) return '';
      // The provenance still has to travel — just as a separate instruction
      // rather than as part of a citable line. Without it the generator cannot
      // tell material gathered FOR this artifact from material the thread
      // happens to be carrying, and it appends everything: a PDF that was meant
      // to cite official Austrian sources shipped an appendix full of hits from
      // three turns earlier, each of them looking equally approved.
      const carried = entries.flatMap((e, i) => (e.prior ? [i + 1] : []));
      if (carried.length === 0) return lines;
      return `${lines}\n\nHERKUNFT: Die Quellen ${carried
        .map((n) => `[${n}]`)
        .join(
          ', '
        )} stammen aus einem FRÜHEREN Teil dieses Gesprächs und wurden nicht für diesen Auftrag gesucht. Nutze sie nur, wenn sie inhaltlich zum Auftrag passen, und übernimm sie NICHT ungeprüft in eine Quellenliste. Diese Zeile selbst gehört nicht in das Dokument.`;
    },
    getCitations() {
      // Project each result in registry order and stamp the registry index as
      // the id — NOT buildCitations(all), which would re-sort/group/cap and
      // break alignment with the snippet numbers the model cited.
      return entries.flatMap((e, i) => {
        const [projected] = buildCitations([e.result]);
        return projected ? [{ ...projected, id: i + 1 }] : [];
      });
    },
    get size() {
      return entries.length;
    },
    get carriedSize() {
      return entries.filter((e) => e.prior).length;
    },
    get freshSize() {
      return entries.filter((e) => !e.prior && !e.seeded).length;
    },
  };
}

/**
 * Monitor-Engine. Nicht die Chat-Recherche. Wiedervorlage nur bei Monitor-Umbau.
 *
 * Der einzige Aufrufer ist die Tagesbriefing-Pipeline (`HotTopicPipeline`). Im
 * Chat ist Recherche seit #2137 die obere Stufe von `web_search` — wer hier
 * einen Chat-Aufrufer ergänzen will, liest vorher `docs/CLAUDE-chat.md`: die
 * Stufenleiter hat den Zwei-Türen-Entwurf bewusst ersetzt.
 *
 * Ablauf: plan → search → READ → assess → synthesise.
 *
 * ── Die Lese-Stufe ist ein kontext-isolierter Subagent, kein eingebauter Crawl ──
 *
 * `readTopSources` reicht jede Seite an `crawlAndDistill`, das sie holt und in
 * einem SEPARATEN Durchgang mit billigem Modell auf die Passagen eindampft, die
 * die Frage beantworten. Die Rohseite erreicht weder den Kontext dieser Funktion
 * noch den des Synthetisierers — zurück kommt ein Destillat. Genau darum geht
 * es: eine 60k-Zeichen-Seite müsste sonst entweder blind gekürzt werden (die
 * Antwort geht verloren) oder ganz mitgeführt (sie verdrängt die neun anderen
 * Quellen). Erst die Isolation macht zwölf gelesene Seiten bezahlbar.
 *
 * Dass die billige Bahn liest, ist Absicht. `heavy` (Gemma 4 26B-A4B auf
 * Scaleway) trägt ein 262k-Fenster und bekam ~3k Zeichen Snippets vorgesetzt;
 * die Grenze war nie die Kapazität des Modells, sondern dass die Pipeline den
 * Text wegwarf, bevor das Fenster überhaupt erreicht war.
 */

import { generateObject, generateText } from 'ai';
import { z } from 'zod';

import {
  executeDirectSearch,
  executeDirectWebSearch,
} from '../../../routes/chat/agents/directSearchExecutors.js';
import { getIntermediateModel } from '../../../routes/chat/agents/providers.js';
import {
  truncateText,
  deduplicateByUrl,
  extractDomainLabel,
  relevanceLabelToScore,
} from '../../../routes/chat/agents/searchFormatting.js';
import { createLogger } from '../../../utils/logger.js';
import { jaccard } from '../../../utils/setSimilarity.js';
import { validateUrlForFetch } from '../../../utils/validation/urlSecurity.js';
import { validateCitations, stripUngroundedCitations } from '../../search/CitationGrounder.js';
import { crawlAndDistill } from '../../search/CrawlingService.js';
import { applyMMR } from '../../search/DiversityReranker.js';

export type ResearchLocale = 'de' | 'at' | 'eu';
export type ReportShape = 'biographical' | 'comparative' | 'positional' | 'event' | 'general';

/**
 * Sub-question count is a floor with a generous ceiling, not a corridor.
 *
 * It used to be `.max(6)` on the grounds of request budget. That reasoning came
 * from the era when each sub-question bought several paid calls; a sub-search is
 * now ONE `gruendlich` call, which is the same engine depth and the same single
 * paid call as the cheap tier (measured 1978ms → 2986ms for twice the material).
 * So the ceiling protects wall-clock, not cost — and the round budget below
 * already does that, per round, where it can count.
 */
export const DeepPlanSchema = z.object({
  subQuestions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        sources: z.array(z.enum(['web', 'qdrant'])).min(1),
      })
    )
    .min(2)
    .max(10),
  locale: z.enum(['de', 'at', 'eu']),
  reportShape: z.enum(['biographical', 'comparative', 'positional', 'event', 'general']),
});

type DeepPlan = z.infer<typeof DeepPlanSchema>;

const QualityAssessmentSchema = z.object({
  score: z.number().int().min(1).max(5),
  weakAspects: z.array(z.string()).max(4).optional(),
});

const log = createLogger('Research');

// ── Budgets ──────────────────────────────────────────────────────────
//
// Every number here bounds WALL-CLOCK or context, and none of them bounds cost
// in the way the numbers they replace claimed to. The distinction matters
// because the old values were tuned as if they were cost controls: 4 results per
// sub-search, 8 sources into synthesis, exactly one refinement round. Measured,
// a sub-search costs the same whether it returns 4 hits or 10 (`maxResults` is
// not a Linkup pricing dimension — depth × outputType is), so those caps bought
// nothing and cost material.

/**
 * Results per sub-search, at the `gruendlich` tier.
 *
 * The tier matters more than the number: it adds Linkup's adjacent-keyword
 * fan-out INSIDE the one paid call, which is the breadth our own `expandQuery`
 * used to buy with two extra calls. That expansion is gone from this path for
 * exactly that reason.
 */
const SUB_SEARCH_RESULTS = 8;

/** Rounds of searching, including the first. Each round may read pages. */
const MAX_SEARCH_ROUNDS = 3;

/**
 * Sub-searches across all rounds. The real wall-clock bound — rounds are
 * sequential (each waits on the previous round's coverage verdict) while the
 * searches inside a round run in parallel.
 */
const MAX_SUB_SEARCHES = 16;

/** Coverage at or above which the material is good enough to write from. */
const COVERAGE_TARGET = 4;

/** Pages read per round. */
const READER_PAGES_PER_ROUND = 6;
/** Characters kept from each page after distillation. */
const READER_TARGET_CHARS = 6_000;
/** Per-page fetch budget. Generous: this path has no interactive turn waiting. */
const READER_TIMEOUT_MS = 8_000;
/**
 * How far down the ranking to look for readable URLs. Each candidate costs a
 * DNS round trip in `validateUrlForFetch`, so a run of blocked hosts must not
 * turn into an unbounded sequence of lookups before the first fetch.
 */
const READER_SCAN_LIMIT = 14;

/** Sources carried into synthesis when the caller names no limit. */
const DEFAULT_MAX_SOURCES = 20;

/**
 * Per-source characters in the synthesis prompt.
 *
 * A read page and an unread snippet get the same ceiling; the snippet simply
 * does not reach it. Sized so the full source block stays well inside the
 * `heavy` lane's window even at `DEFAULT_MAX_SOURCES` read pages.
 */
const SYNTHESIS_SOURCE_CHARS = 6_000;

/**
 * Two sources count as the same document above this Jaccard overlap of their
 * 3-word shingles.
 *
 * MEASURED, not guessed, against the 26 sources of the Monitor run on
 * 11.08.2026 (hot topic "Europa/Außen"), hand-labelled into five same-document
 * pairs and seven merely-related ones:
 *
 *   same document      0.578 … 0.808   (same press release under two URLs,
 *                                       same Antrag in two renderings)
 *   different document 0.004 … 0.079   (two press releases in the same house
 *                                       format, a report ABOUT the Antrag next
 *                                       to the Antrag itself, two pages sharing
 *                                       one quoted sentence)
 *
 * 0.4 sits in the empty middle of that gap: 5× above the worst false-positive
 * candidate and well under the weakest true duplicate. The margin is what
 * matters — a threshold that merely beat the negatives would fold two genuine
 * sources into one on the next run, and a dropped source is invisible in a way
 * a duplicate is not.
 */
const DUPLICATE_SOURCE_SIMILARITY = 0.4;

/**
 * Chars of a source considered when comparing. Bounds the O(n²) comparison for
 * pages that arrive as 50k-char dumps; the opening of a document is also where
 * two renderings of it agree most.
 */
const SIMILARITY_TEXT_CHARS = 4000;

/** Snippet length on the citation objects the UI card renders. */
const CITATION_SNIPPET_CHARS = 400;

export interface ResearchCitation {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  /** Set only for citations backed by an indexed Qdrant document (see `toDocSource`). */
  documentId?: string;
  chunkIndex?: number;
}

export interface ResearchResult {
  answer: string;
  citations: ResearchCitation[];
  followUpQuestions: string[];
  searchSteps: Array<{
    tool: string;
    query: string;
    resultsCount: number;
  }>;
  confidence: 'high' | 'medium' | 'low';
}

interface CollectedSource {
  id: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  relevance: number;
  sourceType: 'web' | 'document' | 'person';
  /** The page was fetched and distilled, so `snippet` is a digest, not a teaser. */
  read?: boolean;
  /** Set only for `sourceType: 'document'` hits — carried from `DocSearchHit`. */
  documentId?: string;
  chunkIndex?: number;
}

/**
 * Decompose the question into sub-questions and infer scope + report shape.
 *
 * Returns null when the model fails, and the caller then researches the question
 * as a single sub-question rather than falling back to a keyword heuristic. The
 * heuristic that used to sit there (`planResearch`: a handful of German regexes
 * deciding "party question?" / "current events?") predates trusting a model with
 * planning at all, and it decided worse than the trivial fallback does — it
 * routinely sent a biographical question to the party-document collection alone.
 */
async function planResearchDeep(
  question: string,
  defaultLocale: ResearchLocale
): Promise<DeepPlan | null> {
  const aiModel = getIntermediateModel('heavy');

  try {
    const result = await generateObject({
      model: aiModel,
      schema: DeepPlanSchema,
      system: `Du planst eine vertiefte Recherche zu Fragen rund um die Grünen (Deutschland und Österreich).

Aufgabe: Zerlege die Nutzerfrage in Sub-Fragen, die zusammen das Thema gut abdecken.
- Nimm so viele, wie das Thema wirklich hat — bei einer engen Faktenfrage zwei, bei einem breiten Thema auch acht. Erfinde keine Aspekte, nur um auf eine Zahl zu kommen.
- Jede Sub-Frage adressiert einen eigenen Aspekt (z.B. Biografie, Karriere, Positionen, Aktuelles, Kontroversen, Vergleiche).
- WICHTIG: Jede Sub-Frage MUSS die zentrale Entität (Person, Partei, Thema, Ereignis) aus der Nutzerfrage explizit nennen. Schreibe z.B. "Welche politischen Positionen vertritt Mona Neubaur?" — NICHT "Welche politischen Positionen?". Sonst liefern Suchmaschinen ohne Kontext irrelevante Treffer.
- Pro Sub-Frage wähle die passende Quellenart: 'qdrant' für Parteipositionen/Beschlüsse/interne Dokumente, 'web' für Aktuelles/Personen/externe Fakten.
- Bestimme die Sprache/Land:
  * 'at' wenn Österreich-Bezug (z.B. Werner Kogler, Leonore Gewessler, .at-Domain, "Österreich")
  * 'de' wenn Deutschland-Bezug (z.B. Bundestag, Habeck, Merz)
  * 'eu' nur wenn explizit EU-weit
- Bestimme die Berichtsform:
  * 'biographical' für Personenfragen ("wer ist X")
  * 'comparative' für Vergleiche ("X vs Y", "Unterschiede")
  * 'positional' für Themenfragen ("Position zu X", "wie steht Partei zu Y")
  * 'event' für Ereignisse/Aktuelles
  * 'general' als Default

Gib NUR JSON zurück, das dem Schema entspricht.`,
      prompt: `Nutzerfrage: ${question}\n\nDefault-Land: ${defaultLocale}`,
      temperature: 0.2,
    });

    log.info(
      `[Research] Plan: ${result.object.subQuestions.length} Sub-Fragen, locale=${result.object.locale}, shape=${result.object.reportShape}`
    );
    return result.object;
  } catch (error) {
    log.warn(
      `[Research] Planner failed, researching the question as one sub-question: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * The plan for a question the planner could not decompose: ask it as-is, of both
 * source kinds. Two sub-questions rather than one so the schema's own floor is
 * met and both collections are actually consulted.
 */
function fallbackPlan(question: string, locale: ResearchLocale): DeepPlan {
  return {
    subQuestions: [
      { id: 'f1', question, sources: ['web'] },
      { id: 'f2', question, sources: ['qdrant'] },
    ],
    locale,
    reportShape: 'general',
  };
}

/**
 * Map a research locale to (Qdrant collection, SearXNG language) tuples.
 */
export function localeToSearchScope(locale: ResearchLocale): {
  qdrantCollection: string;
  webLanguage: string;
  docDomain: string;
} {
  switch (locale) {
    case 'at':
      return {
        qdrantCollection: 'oesterreich',
        webLanguage: 'de-AT',
        docDomain: 'gruene.at',
      };
    case 'eu':
      return { qdrantCollection: 'deutschland', webLanguage: 'de-DE', docDomain: 'gruene.de' };
    case 'de':
    default:
      return { qdrantCollection: 'deutschland', webLanguage: 'de-DE', docDomain: 'gruene.de' };
  }
}

type WebSearchHit = Awaited<ReturnType<typeof executeDirectWebSearch>>['results'][number];
type DocSearchHit = Awaited<ReturnType<typeof executeDirectSearch>>['results'][number];

/**
 * Rank decay is deliberately steeper here (0.1) than in searchNode (0.15):
 * this value is the FINAL sort key feeding applyMMR and the maxSources cut,
 * whereas searchNode's feeds normalizeScore before a cross-encoder rerank.
 * Do not unify the two — it retunes research source selection.
 */
function toWebSource(result: WebSearchHit, id: number): CollectedSource {
  return {
    id,
    title: result.title,
    url: result.url,
    domain: result.domain,
    snippet: result.snippet,
    relevance: 1 - (result.rank - 1) * 0.1,
    sourceType: 'web',
  };
}

function toDocSource(result: DocSearchHit, id: number, domain: string): CollectedSource {
  return {
    id,
    title: result.source,
    url: result.url || '',
    domain,
    snippet: result.excerpt,
    // Lossy: executeDirectSearch also ships the raw `score`, which this path
    // discards. See the note in searchNode's normalizeScore.
    relevance: relevanceLabelToScore(result.relevance),
    sourceType: 'document',
    ...(result.documentId ? { documentId: result.documentId } : {}),
    ...(result.chunkIndex != null ? { chunkIndex: result.chunkIndex } : {}),
  };
}

/**
 * Confidence from what the run actually produced, instead of a constant.
 *
 * An inherited query caps at 'medium': the subject was inferred from the
 * conversation, so even a perfect retrieval may have researched the wrong
 * thing — which is exactly the failure that made this label misleading.
 *
 * The label is not cosmetic. `respondNode` injects it into the system prompt and
 * forbids the model to say it found nothing, so a 'high' over a thin run
 * actively suppresses the honest answer.
 */
export function researchConfidence(signals: {
  sources: number;
  domains: number;
  answerLength: number;
}): 'high' | 'medium' | 'low' {
  const { sources, domains, answerLength } = signals;
  if (sources === 0 || answerLength < 80) return 'low';
  if (sources >= 8 && domains >= 4) return 'high';
  if (sources >= 3 && domains >= 2) return 'medium';
  return 'low';
}

/**
 * Read the highest-ranked sources and replace their teaser snippets with a
 * question-focused digest of the actual page.
 *
 * This is the stage the research path never had. Everything downstream — the
 * coverage verdict, the synthesis, the citations — was written from search
 * snippets, so "deep research" meant "more snippets" rather than "read more".
 *
 * Three properties are load-bearing:
 *
 * - **The raw page never returns.** `crawlAndDistill` sets `content` to the
 *   digest and keeps `fullContent` to itself. Merging the digest is what lets
 *   this scale to a dozen pages; merging raw pages would blow the synthesis
 *   window on the first two.
 * - **URLs are SSRF-validated** even though they come from the search engine
 *   rather than from a model. A page that ranks for a query is still
 *   third-party text chosen by a third party, and this is a server-side fetch.
 * - **It never throws.** A page that is blocked, slow or unparseable leaves its
 *   source exactly as the search returned it. Reading is an upgrade, so its
 *   failure mode is the previous behaviour, not an error.
 */
async function readTopSources(
  sources: CollectedSource[],
  question: string
): Promise<{ sources: CollectedSource[]; pagesRead: number }> {
  const ranked = [...sources].sort((a, b) => b.relevance - a.relevance);
  const seeds: Array<{ url: string; title: string; content: string; relevance: number }> = [];
  /** Fetched (validated) URL → the source's own URL, which is what it is keyed by. */
  const originalUrl = new Map<string, string>();
  for (const source of ranked.slice(0, READER_SCAN_LIMIT)) {
    if (seeds.length >= READER_PAGES_PER_ROUND) break;
    // Already-read sources are skipped rather than re-fetched: a refinement
    // round re-ranks the whole pool, so without this the same top pages would
    // be read again every round and the budget would never reach new ones.
    if (source.read || !source.url) continue;
    const check = await validateUrlForFetch(source.url);
    if (!check.isValid || !check.url) {
      log.warn(`[Research] Lesen übersprungen für ${source.url}: ${check.error ?? 'invalid'}`);
      continue;
    }
    // The VALIDATED url is what gets fetched, per CLAUDE.md — the checker
    // normalises, and handing the raw string on would fetch something the check
    // never saw. It is therefore also the key the crawler answers under, hence
    // the map back to the source's own url below.
    const fetchUrl = check.url.toString();
    originalUrl.set(fetchUrl, source.url);
    seeds.push({
      url: fetchUrl,
      title: source.title,
      content: source.snippet,
      relevance: source.relevance,
    });
  }
  if (seeds.length === 0) return { sources, pagesRead: 0 };

  try {
    const crawled = await crawlAndDistill(seeds, question, {
      maxUrls: READER_PAGES_PER_ROUND,
      timeout: READER_TIMEOUT_MS,
      // `query-focused` rather than `faithful`: nobody named these pages, they
      // are search hits standing in for an answer. Selecting against the
      // question is the entire reason to read them rather than trust the teaser.
      mode: 'query-focused',
      targetChars: READER_TARGET_CHARS,
      // Hiess bis zur Fassaden-Migration `...(aiClient ? { aiClient } : {})`:
      // der Destillierer las den Client auf seine ANWESENHEIT, nicht auf seinen
      // Inhalt. `app.locals.aiClient` war immer gesetzt, der Zweig also immer
      // wahr — was er meinte, steht jetzt da.
      condense: true,
    });
    const digestByUrl = new Map(
      crawled
        .filter((r) => r.crawled && r.content)
        .map((r) => [originalUrl.get(r.url ?? '') ?? r.url, r.content as string])
    );
    if (digestByUrl.size === 0) return { sources, pagesRead: 0 };

    log.info(
      `[Research] ${digestByUrl.size}/${seeds.length} Seiten gelesen für "${truncateText(question, 60)}"`
    );
    return {
      sources: sources.map((source) => {
        const digest = source.url ? digestByUrl.get(source.url) : undefined;
        return digest ? { ...source, snippet: digest, read: true } : source;
      }),
      pagesRead: digestByUrl.size,
    };
  } catch (error) {
    log.warn(
      `[Research] Lesen fehlgeschlagen, bleibe bei den Snippets: ${error instanceof Error ? error.message : String(error)}`
    );
    return { sources, pagesRead: 0 };
  }
}

/**
 * Execute one round: fan out one mini-search per sub-question, with
 * locale-scoped collections and language.
 */
async function executeRound(
  plan: DeepPlan,
  startSourceId: number
): Promise<{ sources: CollectedSource[]; searchSteps: ResearchResult['searchSteps'] }> {
  const sources: CollectedSource[] = [];
  const searchSteps: ResearchResult['searchSteps'] = [];
  let sourceId = startSourceId;
  const { qdrantCollection, webLanguage, docDomain } = localeToSearchScope(plan.locale);

  const tasks = plan.subQuestions.flatMap((sq) => {
    const subTasks: Array<Promise<{ kind: 'web' | 'doc'; query: string; data: unknown }>> = [];
    if (sq.sources.includes('web')) {
      subTasks.push(
        executeDirectWebSearch({
          query: sq.question,
          searchType: 'general',
          // The tier, not just the count: `gruendlich` asks Linkup for its
          // adjacent-keyword fan-out inside the SAME paid call. This path used
          // to buy that breadth with its own `expandQuery` variants — two extra
          // calls for what the engine offers in one.
          tier: 'gruendlich',
          maxResults: SUB_SEARCH_RESULTS,
          language: webLanguage,
        })
          .then((data) => ({ kind: 'web' as const, query: sq.question, data }))
          .catch((err: unknown) => {
            log.warn(
              `[Research] Web-Teilsuche fehlgeschlagen für "${sq.question}": ${err instanceof Error ? err.message : String(err)}`
            );
            return { kind: 'web' as const, query: sq.question, data: null };
          })
      );
    }
    if (sq.sources.includes('qdrant')) {
      subTasks.push(
        executeDirectSearch({
          query: sq.question,
          collection: qdrantCollection,
          limit: SUB_SEARCH_RESULTS,
        })
          .then((data) => ({ kind: 'doc' as const, query: sq.question, data }))
          .catch((err: unknown) => {
            log.warn(
              `[Research] Qdrant-Teilsuche fehlgeschlagen für "${sq.question}": ${err instanceof Error ? err.message : String(err)}`
            );
            return { kind: 'doc' as const, query: sq.question, data: null };
          })
      );
    }
    return subTasks;
  });

  const results = await Promise.all(tasks);

  for (const { kind, query, data } of results) {
    if (!data) continue;
    if (kind === 'web') {
      const web = data as Awaited<ReturnType<typeof executeDirectWebSearch>>;
      searchSteps.push({ tool: 'web_search', query, resultsCount: web.resultsCount });
      for (const result of web.results) {
        sources.push(toWebSource(result, sourceId++));
      }
    } else {
      const doc = data as Awaited<ReturnType<typeof executeDirectSearch>>;
      searchSteps.push({
        tool: 'gruenerator_search',
        query,
        resultsCount: doc.resultsCount,
      });
      for (const result of doc.results) {
        sources.push(toDocSource(result, sourceId++, docDomain));
      }
    }
  }

  const uniqueSources = deduplicateByUrl(sources, (s) => s.url || undefined);
  uniqueSources.sort((a, b) => b.relevance - a.relevance);
  return { sources: uniqueSources, searchSteps };
}

/**
 * How well the material covers the question, and what is still missing.
 *
 * Judged over EVERY source at full length, not the first eight at 150
 * characters. The old sample was small enough that the assessor was largely
 * scoring the top hits' titles — and it is the gate deciding whether to spend
 * another round, so a blind gate spends badly in both directions.
 */
async function assessCoverage(
  question: string,
  sources: CollectedSource[]
): Promise<{ score: number; weakAspects: string[] }> {
  if (sources.length <= 1) return { score: 1, weakAspects: [] };

  const aiModel = getIntermediateModel('standard');
  const summary = sources
    .map((s, i) => `[${i + 1}] ${s.title}: ${truncateText(s.snippet, 1_200)}`)
    .join('\n');

  try {
    const result = await generateObject({
      model: aiModel,
      schema: QualityAssessmentSchema,
      system: `Du bewertest, ob Suchergebnisse eine Recherche-Frage ausreichend abdecken.
Bewerte Abdeckung 1–5 (5 = vollständig, 3 = lückenhaft, 1 = unzureichend).
Wenn lückenhaft: nenne 1–3 schwach abgedeckte Aspekte als kurze Suchphrasen (nicht ganze Fragen).`,
      prompt: `Frage: ${question}\n\nErgebnisse:\n${summary}`,
      temperature: 0.0,
    });
    return {
      score: result.object.score,
      weakAspects: result.object.weakAspects ?? [],
    };
  } catch (error) {
    log.warn(
      `[Research] Abdeckungsprüfung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`
    );
    // Treated as "good enough": a broken assessor must not spend the remaining
    // rounds, since it cannot say what they would target.
    return { score: COVERAGE_TARGET, weakAspects: [] };
  }
}

/**
 * Synthesise the sources into a report with inline citations.
 *
 * No output cap. There was one — 500 / 1500 / 2400 tokens by branch — and it
 * contradicted the prompt it shipped with: `general` asks for "3–5 Aspekte" at
 * "1–3 Absätze" each, which does not fit in 2400 tokens, so the report was
 * truncated mid-section precisely on the broad questions it was written for.
 * The answer paths dropped their output caps in #2002 for the same reason.
 */
async function synthesizeReport(params: {
  question: string;
  sources: CollectedSource[];
  strategy: string;
  reportShape: ReportShape;
}): Promise<string> {
  const { question, sources, strategy, reportShape } = params;
  const aiModel = getIntermediateModel('heavy');

  const shapeTemplate: Record<ReportShape, string> = {
    biographical:
      'Strukturiere als mehrteiligen Bericht mit Markdown-Überschriften (##): "Werdegang", "Politische Karriere", "Positionen", "Aktuelles". Pro Abschnitt 1–3 Absätze.',
    comparative:
      'Strukturiere als Vergleich mit Markdown-Überschriften (##): "Position A", "Position B", "Unterschiede", "Gemeinsamkeiten". Pro Abschnitt 1–3 Absätze.',
    positional:
      'Strukturiere als Positionsbericht mit Markdown-Überschriften (##): "Hintergrund", "Position", "Begründung", "Kritik & Debatte". Pro Abschnitt 1–3 Absätze.',
    event:
      'Strukturiere als Ereignisbericht mit Markdown-Überschriften (##): "Was ist passiert", "Hintergrund", "Reaktionen", "Einordnung". Pro Abschnitt 1–3 Absätze.',
    general:
      'Strukturiere als ausführlichen Bericht mit Markdown-Überschriften (##) für die wichtigsten 3–5 Aspekte. Pro Abschnitt 1–3 Absätze.',
  };

  const systemPrompt = `Du bist ein Recherche-Assistent der Grünen Partei. Synthetisiere die gegebenen Quellen zu einer kohärenten, informativen Antwort auf Deutsch.

Regeln:
- Nutze NUR Informationen aus den gegebenen Quellen
- Verwende Inline-Zitate [1], [2] etc. für jede Aussage, die sich auf eine Quelle bezieht
- ${shapeTemplate[reportShape]}
- Keine Erfindungen oder externes Wissen hinzufügen
- Bewerte nichts, was die Quelle nicht selbst bewertet
- Antworte immer auf Deutsch
- Fasse die wichtigsten Informationen zusammen und stelle Zusammenhänge her
- Manche Quellen sind vollständig gelesene Seiten, andere nur kurze Suchtreffer. Stütze dich bevorzugt auf die ausführlichen.
- Strategie: ${strategy === 'policy_overview' ? 'Fokussiere auf politische Positionen und Beschlüsse' : 'Fasse die faktischen Informationen objektiv zusammen'}`;

  const sourcesText = sources
    .map(
      (s, i) =>
        `[${i + 1}] ${s.title} (${s.domain})${s.read ? ' — vollständig gelesen' : ''}\n${truncateText(s.snippet, SYNTHESIS_SOURCE_CHARS)}`
    )
    .join('\n\n');

  const result = await generateText({
    model: aiModel,
    messages: [{ role: 'user', content: `Frage: ${question}\n\nQuellen:\n${sourcesText}` }],
    system: systemPrompt,
    temperature: 0.2,
  });

  return result.text;
}

/**
 * What to hand back when synthesis itself failed.
 *
 * The template synthesiser this replaces glued source snippets into paragraphs
 * and stamped them with citation markers, which read like an answer while being
 * a concatenation — the one failure mode a research tool must not have. Naming
 * the failure and listing what was found is honest and costs the caller nothing
 * it can use.
 */
function synthesisFailureAnswer(sources: CollectedSource[]): string {
  if (sources.length === 0) {
    return 'Zu dieser Anfrage konnten leider keine relevanten Informationen gefunden werden.';
  }
  const list = sources
    .slice(0, 10)
    .map((s, i) => `${i + 1}. ${s.title}${s.url ? ` — ${s.url}` : ''}`)
    .join('\n');
  return `Die Quellen wurden gefunden, aber der Bericht konnte nicht erstellt werden. Gefundene Quellen:\n\n${list}`;
}

/**
 * Run a research question end to end.
 *
 * @param params.question - The research question. Also the basis for the search
 *   queries, via the planner's sub-questions.
 * @param params.maxSources - Sources carried into synthesis (default 20).
 * @param params.userLocale - Steers the planner's default country. The Monitor
 *   does not pass it yet, so an AT briefing plans as 'de' — the seam is here
 *   when that gets wired up.
 */
export async function executeResearch(params: {
  question: string;
  maxSources?: number;
  userLocale?: string;
}): Promise<ResearchResult> {
  const { question, maxSources = DEFAULT_MAX_SOURCES, userLocale } = params;

  // Defense in depth: refuse an empty question. Without this the planner
  // hallucinates topics from context bias (locale).
  if (!question || !question.trim()) {
    log.warn('[Research] Refusing to run with empty question');
    return {
      answer:
        'Bitte stelle eine konkrete Recherche-Frage. Beispiel: "Recherchiere Friedrich Merz" oder "@recherche aktuelle Klimapolitik".',
      citations: [],
      followUpQuestions: [],
      searchSteps: [],
      confidence: 'low',
    };
  }

  const defaultLocale: ResearchLocale =
    userLocale === 'de-AT' ? 'at' : userLocale === 'de-EU' ? 'eu' : 'de';

  log.info(`[Research] Start: "${truncateText(question, 100)}"`);
  const plan =
    (await planResearchDeep(question, defaultLocale)) ?? fallbackPlan(question, defaultLocale);

  let allSources: CollectedSource[] = [];
  const allSearchSteps: ResearchResult['searchSteps'] = [];
  let searchesSpent = 0;
  let pagesRead = 0;
  let round = 0;
  let currentPlan = plan;

  // Rounds are a BUDGET, not a fixed count. It used to be exactly one optional
  // refinement, hard-capped with the comment "Hard cap: 1 refinement round" —
  // which meant a question the assessor still called lückenhaft after round two
  // was written up anyway, with the gap known and unfilled.
  while (round < MAX_SEARCH_ROUNDS && searchesSpent < MAX_SUB_SEARCHES) {
    round += 1;

    const result = await executeRound(currentPlan, allSources.length + 1);
    searchesSpent += result.searchSteps.length;
    allSearchSteps.push(...result.searchSteps);

    // Dedupe the new round against everything seen so far, by URL.
    const seenUrls = new Set(allSources.map((s) => s.url).filter(Boolean));
    allSources = [...allSources, ...result.sources.filter((s) => !s.url || !seenUrls.has(s.url))];
    log.info(
      `[Research] Runde ${round}: ${result.sources.length} Treffer, ${allSources.length} Quellen gesamt`
    );

    const afterRead = await readTopSources(allSources, question);
    allSources = afterRead.sources;
    pagesRead += afterRead.pagesRead;

    if (round >= MAX_SEARCH_ROUNDS || searchesSpent >= MAX_SUB_SEARCHES) break;

    const coverage = await assessCoverage(question, allSources);
    log.info(
      `[Research] Abdeckung nach Runde ${round}: ${coverage.score}/5${coverage.weakAspects.length ? ` (schwach: ${coverage.weakAspects.join(', ')})` : ''}`
    );
    if (coverage.score >= COVERAGE_TARGET || coverage.weakAspects.length === 0) break;

    // Refinement queries MUST carry entity context. The assessor returns terse
    // phrases like "Herkunft" (per its prompt "kurze Suchphrasen"). Used as-is,
    // search engines get no signal about WHO — Mona Neubaur's "Herkunft" search
    // returned random Bachelorarbeiten. Prefixing the original question carries
    // the entity name through.
    currentPlan = {
      subQuestions: coverage.weakAspects.slice(0, 3).map((aspect, i) => ({
        id: `r${round + 1}-${i}`,
        question: `${question} ${aspect}`,
        sources: ['web', 'qdrant'] as Array<'web' | 'qdrant'>,
      })),
      locale: plan.locale,
      reportShape: plan.reportShape,
    };
  }

  // MMR for diversity, then cap. Re-number contiguously after — the numbers the
  // synthesiser cites are positions in THIS list.
  //
  // The global sort is a PRECONDITION of applyMMR ("results sorted by relevance,
  // highest first"), not tidiness. `executeRound` sorts within its own round, so
  // a single-round run happened to satisfy it — but rounds are concatenated in
  // the order they ran, so from the second round on the array is sorted in
  // segments and MMR seeds itself from round one's best rather than the run's.
  const ranked = [...allSources].sort((a, b) => b.relevance - a.relevance);
  const diverse =
    ranked.length > 3
      ? (applyMMR(
          ranked.map((s) => ({ ...s, content: s.snippet })),
          0.7,
          2
        ) as CollectedSource[])
      : ranked;
  const limitedSources = diverse.slice(0, maxSources).map((s, i) => ({ ...s, id: i + 1 }));

  const strategy =
    plan.reportShape === 'positional' || plan.reportShape === 'comparative'
      ? 'policy_overview'
      : 'factual_synthesis';

  log.info(
    `[Research] Synthese: ${limitedSources.length} Quellen (${pagesRead} gelesen), Form ${plan.reportShape}, ${round} Runde(n), ${searchesSpent} Teilsuchen`
  );
  let answer: string;
  let synthesised = true;
  if (limitedSources.length === 0) {
    answer = synthesisFailureAnswer(limitedSources);
    synthesised = false;
  } else {
    try {
      answer = await synthesizeReport({
        question,
        sources: limitedSources,
        strategy,
        reportShape: plan.reportShape,
      });
    } catch (error) {
      log.error(
        '[Research] Synthese fehlgeschlagen:',
        error instanceof Error ? error.message : String(error)
      );
      answer = synthesisFailureAnswer(limitedSources);
      synthesised = false;
    }
  }

  return finalizeResearchResult({
    answer,
    limitedSources,
    searchSteps: allSearchSteps,
    validateGrounding: synthesised,
  });
}

/**
 * Host + path, lowercased, without `www.`, query, fragment or trailing slash.
 *
 * Deliberately drops the query: the same press release arrives as `…/meldung`
 * and `…/meldung?utm_source=…`, and treating those as two sources is the
 * duplication being removed. Unparseable input falls back to the raw string
 * rather than to a shared empty key, which would collapse every broken URL
 * into one source.
 */
function canonicalUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.host.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Word 3-shingles of the opening of a text, for the overlap comparison. */
function textShingles(text: string): Set<string> {
  const words = text
    .slice(0, SIMILARITY_TEXT_CHARS)
    .toLowerCase()
    .replace(/&[a-z#0-9]+;/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 2);

  const shingles = new Set<string>();
  for (let i = 0; i + 3 <= words.length; i++) shingles.add(words.slice(i, i + 3).join(' '));
  return shingles;
}

export interface DedupedSources {
  citations: ResearchCitation[];
  /** Old citation id → new one. Dropped duplicates point at their survivor. */
  remap: Map<string, string>;
}

/**
 * Collapse sources that are the same document and renumber the survivors 1..n.
 *
 * Linkup's deep research routinely returns one press release twice: as the
 * bundestag.de news item and as the Antrag it quotes, or the same page with and
 * without tracking parameters. Printed as separate numbered sources they read
 * as independent corroboration — that is the part that misleads; the wasted
 * space is the lesser problem.
 *
 * Two stages, because neither alone is enough: identical canonical URLs catch
 * the cheap case exactly, and a text-overlap comparison catches the same
 * document served under genuinely different paths.
 *
 * MUST run before the snippet cap. Measured on the same 26 sources: at the full
 * page text the five true duplicate pairs score 0.578–0.808 and the related-
 * but-distinct ones 0.004–0.079, a gap wide enough to sit in. Truncated to the
 * 300 display chars first, two of those five pairs collapse to 0.015 and 0.113
 * — BELOW the worst false-positive candidate (0.182), so no threshold can
 * separate them any more. The order is the fix, not a detail of it.
 */
export function dedupeResearchSources(citations: ResearchCitation[]): DedupedSources {
  const remap = new Map<string, string>();
  const survivors: ResearchCitation[] = [];
  const byUrl = new Map<string, ResearchCitation>();
  const shingleCache: Set<string>[] = [];

  for (const citation of citations) {
    const urlKey = citation.url ? canonicalUrl(citation.url) : '';
    const sameUrl = urlKey ? byUrl.get(urlKey) : undefined;
    if (sameUrl) {
      remap.set(String(citation.id), String(sameUrl.id));
      continue;
    }

    const shingles = textShingles(citation.snippet || '');
    const twin = survivors.find(
      (_, i) => jaccard(shingles, shingleCache[i] ?? new Set()) >= DUPLICATE_SOURCE_SIMILARITY
    );
    if (twin) {
      remap.set(String(citation.id), String(twin.id));
      continue;
    }

    const renumbered = { ...citation, id: survivors.length + 1 };
    if (urlKey) byUrl.set(urlKey, renumbered);
    remap.set(String(citation.id), String(renumbered.id));
    survivors.push(renumbered);
    shingleCache.push(shingles);
  }

  if (survivors.length < citations.length) {
    log.info(`[Research] Deduped ${citations.length} → ${survivors.length} sources`);
  }
  return { citations: survivors, remap };
}

/**
 * Move every `[N]` in a text onto the id its source ended up with after
 * deduplication. A marker whose source was folded away points at the survivor;
 * a marker the model invented has no entry and stays as it is.
 */
export function remapCitationMarkers(text: string, remap: Map<string, string>): string {
  return text.replace(/\[(\d+)\]/g, (match, n: string) => {
    const target = remap.get(n);
    return target ? `[${target}]` : match;
  });
}

/**
 * Strip citations the sources don't support, then project the sources into
 * citations and derive the confidence label.
 *
 * When most citations turn out ungrounded the answer is KEPT and the confidence
 * drops to 'low'. It used to be replaced by the template synthesiser's
 * snippet concatenation, which traded a report with some bad markers for a
 * source dump with none — a worse artefact that looked more official.
 */
function finalizeResearchResult(params: {
  answer: string;
  limitedSources: CollectedSource[];
  searchSteps: ResearchResult['searchSteps'];
  validateGrounding: boolean;
}): ResearchResult {
  const { limitedSources, searchSteps } = params;
  let { answer } = params;
  let grounded = true;

  if (params.validateGrounding && answer) {
    const groundingResult = validateCitations(
      answer,
      limitedSources.map((s) => ({ id: s.id, content: s.snippet }))
    );

    if (groundingResult.ungroundedCitations.length > 0) {
      log.warn(
        `[Research] ${groundingResult.ungroundedCitations.length} ungrounded citations removed: [${groundingResult.ungroundedCitations.join(', ')}]`
      );
      answer = stripUngroundedCitations(answer, groundingResult.ungroundedCitations);

      if (groundingResult.confidence < 0.5 && groundingResult.totalCitations > 2) {
        log.warn('[Research] >50% der Zitate ungedeckt — Konfidenz auf low');
        grounded = false;
      }
    }
  }

  /**
   * Deduplicate BEFORE the display cap, then move the answer's `[N]` onto the
   * surviving ids.
   *
   * The order is the whole trick and it is measured — see
   * `DUPLICATE_SOURCE_SIMILARITY`: on the full text the true duplicate pairs
   * score 0.578–0.808 against 0.004–0.079 for merely related ones, but truncated
   * to the display snippet first, two of those pairs fall below the worst
   * false positive and no threshold can separate them any more.
   *
   * This used to run only on the Linkup dossier path. It belongs here at least
   * as much: rounds are deduplicated by exact URL as they arrive, which lets the
   * same page through under `?utm_source=…` and under a second path on the same
   * site — precisely the two cases this catches.
   */
  const deduped = dedupeResearchSources(
    limitedSources.map((s) => ({
      id: s.id,
      title: s.title,
      url: s.url,
      domain: s.domain,
      snippet: s.snippet,
      ...(s.documentId ? { documentId: s.documentId } : {}),
      ...(s.chunkIndex != null ? { chunkIndex: s.chunkIndex } : {}),
    }))
  );
  answer = remapCitationMarkers(answer, deduped.remap);

  const citations: ResearchCitation[] = deduped.citations.map((c) => ({
    ...c,
    snippet: truncateText(c.snippet, CITATION_SNIPPET_CHARS),
  }));

  const confidence =
    !params.validateGrounding || !grounded
      ? 'low'
      : researchConfidence({
          sources: citations.length,
          domains: new Set(citations.map((c) => c.domain || extractDomainLabel(c.url))).size,
          answerLength: answer.trim().length,
        });

  log.info(`[Research] Fertig: ${citations.length} Zitate, Konfidenz ${confidence}`);

  return {
    answer,
    citations,
    // Empty by design. The generator this replaces matched three German regexes
    // against the question and emitted fixed strings ("Gibt es aktuelle
    // Entwicklungen zu diesem Thema?") that were about the question's SHAPE, not
    // about what the research found. The UI renders an absent list as absent.
    followUpQuestions: [],
    searchSteps,
    confidence,
  };
}

/**
 * `notebook_suche` — the Grünerator's own corpora, and the personal notebooks
 * this turn already had in hand.
 *
 * Same two rules as the web tools: it never throws (a thrown error ends the
 * agent's turn, a returned sentence lets it adapt), and it reuses the retrieval
 * the rest of the chat uses rather than opening a second path to the data.
 * Concretely that is `executeDirectSearch` for the party collections and
 * `DocumentSearchService` filtered to known document ids for personal notebooks
 * — literally the two calls `searchNode` makes for an ordinary notebook turn.
 *
 * The choice of notebook is a JSON-Schema `enum` rather than a list in the
 * prompt: the model cannot then name a corpus that does not exist, and the two
 * prompts stay free of a list that would go stale on every registry change.
 */

import { tool } from '@langchain/core/tools';

import { executeDirectSearch } from '../../../routes/chat/agents/directSearchExecutors.js';
import { createLogger } from '../../../utils/logger.js';

import { type NotebookCorpus, type NotebookScope } from './notebookScope.js';
import { budgetSpent, rememberSource, type ToolContext } from './toolContext.js';

const log = createLogger('DeepAgentNotebook');

/** Hits per collection. Low because up to three collections are searched. */
const PER_COLLECTION_LIMIT = 5;
/** How many collections one call may fan out over. */
const MAX_COLLECTIONS = 3;
/** Hits from the personal notebooks, in one pass over their documents. */
const PERSONAL_LIMIT = 6;
const EXCERPT_CHARS = 600;

/** Locale defaults, mirroring `getDefaultCollectionsForLocale` in searchNode. */
function defaultCollections(locale: string): string[] {
  return locale === 'de-AT'
    ? ['oesterreich', 'gruene-at']
    : ['deutschland', 'bundestagsfraktion', 'gruene-de', 'kommunalwiki'];
}

interface NotebookHit {
  title: string;
  url: string;
  origin: string;
  excerpt: string;
  /** Stable ledger key: the URL when there is one, else the document id. */
  key: string;
}

function trim(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > EXCERPT_CHARS ? `${clean.slice(0, EXCERPT_CHARS)}…` : clean;
}

/**
 * One line per hit, with the origin spelled out.
 *
 * The origin is not decoration: a hit without a URL must be citable, and the
 * only handle the model has on it is the notebook it came from.
 */
function formatNotebookHits(hits: NotebookHit[]): string {
  if (hits.length === 0) {
    return 'Keine Treffer in den Notebooks. Nutze web_suche für diese Teilfrage.';
  }
  return hits
    .map((h, i) => {
      const address = h.url ? `URL: ${h.url}` : 'Keine URL — zitiere über Titel und Notebook';
      return `${i + 1}. ${h.title}\n   ${h.origin} — ${address}\n   ${h.excerpt}`;
    })
    .join('\n');
}

async function searchCollections(
  collections: string[],
  query: string,
  originOf: (collection: string) => string
): Promise<NotebookHit[]> {
  const hits: NotebookHit[] = [];
  for (const collection of collections.slice(0, MAX_COLLECTIONS)) {
    try {
      const result = await executeDirectSearch({
        query,
        collection,
        limit: PER_COLLECTION_LIMIT,
      });
      for (const r of result.results) {
        const url = r.url ?? '';
        const key = url || `notebook:${r.documentId ?? `${collection}:${r.rank}`}`;
        hits.push({
          title: r.source,
          url,
          origin: originOf(collection),
          excerpt: trim(r.excerpt),
          key,
        });
      }
    } catch (error) {
      // One dead collection must not cost the whole call — the others may still
      // carry the answer.
      log.warn(`[notebook_suche] Sammlung ${collection} fehlgeschlagen: ${String(error)}`);
    }
  }
  return hits;
}

async function searchPersonalDocuments(
  scope: NotebookScope,
  query: string
): Promise<NotebookHit[]> {
  const { getQdrantDocumentService } =
    await import('../../document-services/DocumentSearchService/index.js');
  const response = await getQdrantDocumentService().search({
    query,
    userId: scope.userId,
    options: { limit: PERSONAL_LIMIT, mode: 'hybrid', threshold: 0.2 },
    filters: { documentIds: scope.documentIds },
  });
  return (response.results ?? []).map((r) => ({
    title: r.title || 'Dokument',
    url: r.source_url ?? '',
    origin: 'Eigenes Notebook',
    excerpt: trim(r.relevant_content ?? ''),
    key: r.source_url || `notebook:${r.document_id ?? r.title}`,
  }));
}

export function createNotebookTool(ctx: ToolContext, scope: NotebookScope) {
  const titleOf = new Map<string, string>();
  for (const corpus of scope.corpora) {
    for (const collection of corpus.collections) {
      if (!titleOf.has(collection)) titleOf.set(collection, corpus.title);
    }
  }
  const originOf = (collection: string): string =>
    `Notebook: ${titleOf.get(collection) ?? collection}`;

  const byId = new Map<string, NotebookCorpus>(scope.corpora.map((c) => [c.id, c]));
  const examples = scope.corpora
    .slice(0, 4)
    .map((c) => c.title)
    .join(', ');

  return tool(
    async (input: unknown): Promise<string> => {
      const { frage, notebook } = input as { frage: string; notebook?: string };
      const stop = budgetSpent(ctx);
      if (stop) return stop;
      if (ctx.budget.notebookSearchesLeft <= 0) {
        return 'Budget für Notebook-Suchen aufgebraucht. Arbeite mit dem vorhandenen Material weiter.';
      }

      // An invented name never gets this far: the schema's `enum` is enforced
      // before the handler runs. Without corpora there is no enum, and then a
      // stray `notebook` simply falls back to the turn's own selection.
      const chosen = notebook ? byId.get(notebook) : null;

      ctx.budget.notebookSearchesLeft -= 1;
      const label = `Notebook: ${chosen?.title ?? 'Grüne Quellen'} — ${frage}`;
      ctx.onStep(label, 'running');

      // Same precedence as an ordinary chat turn: an explicit pick beats the
      // turn's own notebook selection, which beats the locale defaults.
      const collections = chosen
        ? chosen.collections
        : scope.mentionedCollections.length > 0
          ? scope.mentionedCollections
          : defaultCollections(ctx.locale);

      const hits = await searchCollections(collections, frage, originOf);

      // Personal notebooks are searched alongside the corpora rather than
      // instead of them: the user picked them for this conversation, so they are
      // relevant to every sub-question, not only to one the model singles out.
      if (scope.documentIds.length > 0 && !chosen) {
        try {
          hits.push(...(await searchPersonalDocuments(scope, frage)));
        } catch (error) {
          log.warn(`[notebook_suche] Eigene Dokumente fehlgeschlagen: ${String(error)}`);
        }
      }

      if (hits.length === 0) {
        ctx.onStep(label, 'done');
        return formatNotebookHits(hits);
      }

      for (const hit of hits) {
        rememberSource(ctx, {
          key: hit.key,
          url: hit.url,
          title: hit.title,
          ...(hit.url ? {} : { origin: hit.origin }),
        });
      }
      ctx.onStep(label, 'done');
      return formatNotebookHits(hits);
    },
    {
      name: 'notebook_suche',
      description: `Durchsucht die Notebooks des Grünerators — Programme, Beschlüsse, Positionen und Pressemitteilungen der Grünen${examples ? ` (u. a. ${examples})` : ''}. Nutze es für alles, was grüne Haltung, Beschlusslage oder Programmatik betrifft, bevor du ins Web gehst. Ohne Angabe eines Notebooks wird die passende Auswahl automatisch durchsucht.`,
      schema: {
        type: 'object',
        properties: {
          frage: { type: 'string', description: 'Die Teilfrage, ausformuliert' },
          notebook: {
            type: 'string',
            description: 'Ein bestimmtes Notebook. Weglassen, wenn die Standardauswahl passt.',
            // Omitted rather than left empty when no corpus is in reach — an
            // empty enum admits no value at all and would break the schema.
            ...(byId.size > 0 ? { enum: [...byId.keys()] } : {}),
          },
        },
        required: ['frage'],
      },
    }
  );
}

/**
 * ts-rest-Router des Chunk-Inspektors (#3123). Lesend, admin-gesichert.
 *
 * `requireAuth` sitzt am Präfix `/api/auth/admin/chunk-inspector` (routes.ts)
 * und deckt nur die Anmeldung ab; die Rolle prüft jeder Handler selbst — dieselbe
 * Begründung wie in agentVisibilityContractRouter.ts:4-7.
 *
 * Das einzige Gatter dieses Routers ist `requireInstanceAdmin`. Für
 * Nutzer-Notebooks läuft die Suche unten mit der Kennung der Eigentümerin
 * (`userId: notebook.user_id`) — `checkNotebookAccess` innerhalb von
 * `getSearchContext` ist damit per Konstruktion erfüllt, nicht umgangen: ein
 * Instanz-Admin würde die Mitgliedschaftsprüfung sonst nie bestehen, die
 * Eigentümerin besteht sie immer. Zwei Autorisierungen auf einer Route ist
 * die Bauform, aus der Rechteverwechslungen entstehen — deshalb sitzt die
 * gesamte Zugriffsentscheidung an dieser einen Stelle. Geschrieben wird
 * nichts.
 */
import { chunkInspectorContract } from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';
import { eq } from 'drizzle-orm';

import { getSystemCollectionConfig } from '../../config/systemCollectionsConfig.js';
import { vectorConfig } from '../../config/vectorConfig.js';
import { documents } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { DocumentSearchService } from '../../services/document-services/DocumentSearchService/index.js';
import { buildEmbeddingText } from '../../services/document-services/embeddingText.js';
import { notebookQAService } from '../../services/notebook/index.js';
import { requireInstanceAdmin } from '../../utils/adminAuthz.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { getAuthedUser } from '../../utils/getAuthedUser.js';
import { createLogger } from '../../utils/logger.js';

import type { InspectedPayloadSummary } from '../../services/document-services/DocumentSearchService/types.js';
import type { Application } from 'express';

const log = createLogger('chunkInspectorContractRouter');

const documentSearchService = new DocumentSearchService();
const notebookHelper = new NotebookQdrantHelper();

const FORBIDDEN = {
  status: 403 as const,
  body: { success: false, message: 'Keine Admin-Berechtigung.' },
};

const s = initServer();

/**
 * Der Titel-Präfix, den `buildEmbeddingText` vor jeden Chunk setzt. Nicht
 * nachgebaut, sondern derselbe Aufruf: mit leerem Chunk bleibt genau der auf
 * 200 Zeichen gekappte Titel plus Leerzeile übrig (embeddingText.ts:9-17).
 */
function embeddingTitlePrefix(title: string | null): string | null {
  if (!title) return null;
  const prefix = buildEmbeddingText('', title).replace(/\n\n$/, '');
  return prefix.length > 0 ? prefix : null;
}

function readExtractionMethod(
  metadata: Record<string, unknown> | null,
  payload: InspectedPayloadSummary | null
): {
  extractionMethod: string | null;
  extractionMethodOrigin: 'postgres_metadata' | 'qdrant_payload' | 'unknown';
} {
  // Nutzerdokumente: OcrService/databaseOperations.ts:41-48 schreibt den
  // camelCase-Schlüssel nach documents.metadata. Scraper- und Skriptpfade:
  // snake_case in der Qdrant-Nutzlast (ProgramPdfScraper.ts:380).
  const fromPostgres = metadata?.extractionMethod;
  if (typeof fromPostgres === 'string' && fromPostgres.length > 0) {
    return { extractionMethod: fromPostgres, extractionMethodOrigin: 'postgres_metadata' };
  }
  if (payload?.extractionMethod) {
    return { extractionMethod: payload.extractionMethod, extractionMethodOrigin: 'qdrant_payload' };
  }
  return { extractionMethod: null, extractionMethodOrigin: 'unknown' };
}

function retrievalThreshold(): number | null {
  const quality = vectorConfig.get('quality');
  return quality.retrieval.enableQualityFilter ? quality.retrieval.minRetrievalQuality : null;
}

export const chunkInspectorContractRouter = s.router(chunkInspectorContract, {
  inspectDocument: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const { collection, offset, limit } = args.query;
      // Query gewinnt über den Pfad: URL-förmige IDs überleben den Pfad nicht
      // (der Reverse-Proxy dekodiert %2F und merged Slashes), sie reisen im
      // Query-String und der Pfad trägt den Platzhalter '-'.
      const documentId = args.query.documentId ?? args.params.documentId;

      // Der kanonische Auflöser. SYSTEM_COLLECTION_MAP (DocumentSearchService.ts:65)
      // ist eine unvollständige Zweitkopie und wird hier nicht angefasst.
      const systemConfig = getSystemCollectionConfig(collection);
      const qdrantCollection = systemConfig ? systemConfig.qdrantCollection : 'documents';

      const result = await documentSearchService.inspectDocumentChunks(
        documentId,
        qdrantCollection,
        {
          offset,
          limit,
        }
      );
      if (!result.success) {
        return {
          status: 404 as const,
          body: { success: false, message: result.error ?? 'Keine Chunks gefunden.' },
        };
      }

      // Ohne user_id-Klausel: getDocumentById ist eigentümergebunden
      // (metadataOperations.ts:266) und taugt für einen Admin-Blick nicht.
      // Für Systemsammlungen gibt es gar keine Zeile — dann trägt die Nutzlast alles.
      const db = getDrizzleInstance();
      const rows = systemConfig
        ? []
        : await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
      const row = rows[0] ?? null;

      const title = row?.title ?? result.payload?.title ?? null;
      const { extractionMethod, extractionMethodOrigin } = readExtractionMethod(
        row?.metadata ?? null,
        result.payload
      );
      const pageCount =
        row?.page_count && row.page_count > 0 ? row.page_count : (result.payload?.maxPage ?? null);

      return {
        status: 200 as const,
        body: {
          success: true,
          header: {
            documentId,
            collection,
            qdrantCollection,
            isSystemCollection: Boolean(systemConfig),
            title,
            filename: row?.filename ?? result.payload?.filename ?? null,
            sourceUrl: row?.source_url ?? result.payload?.sourceUrl ?? null,
            sourceType: row?.source_type ?? result.payload?.sourceType ?? null,
            extractionMethod,
            extractionMethodOrigin,
            pageCount,
            chunkCount: result.chunkCount,
            indexedAt: row?.updated_at?.toISOString() ?? result.payload?.createdAt ?? null,
            embeddingTitlePrefix: embeddingTitlePrefix(title),
            qualityThreshold: retrievalThreshold(),
          },
          chunks: result.chunks,
          nextOffset: result.nextOffset,
        },
      };
    } catch (error) {
      log.error('[chunkInspector.inspectDocument] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Chunks konnten nicht gelesen werden.' },
      };
    }
  },

  inspectSearch: async (args) => {
    try {
      const authedUser = getAuthedUser(args.req);
      if (!(await requireInstanceAdmin(authedUser.id, authedUser.email))) return FORBIDDEN;

      const { collection, query } = args.query;
      // s.o.: Query-documentId gewinnt über den Pfad-Platzhalter.
      const documentId = args.query.documentId ?? args.params.documentId;
      const systemConfig = getSystemCollectionConfig(collection);

      if (systemConfig) {
        // Bei Systemsammlungen fragt der Abrufdienst `getDocumentIdsFn` gar nicht
        // (NotebookQAService.ts:685-708) — er baut seinen Filter aus
        // applyDefaultFilter. Statt dort eine document_id-Klausel einzuziehen (die
        // alle Systemsammlungs-Suchen mitträgt) läuft die Suche sammlungsweit und
        // die Antwort sagt das mit `scoped: false`.
        //
        // `getSearchContext` statt `askSingleCollection`: nur die Abrufhälfte, kein
        // Modellaufruf — dieselbe Begründung wie routes/v1/landesverbandNotebooks.ts:76-81.
        const context = await notebookQAService.getSearchContext({
          question: query,
          collectionId: collection,
        });
        const results = context?.sortedResults ?? [];
        return {
          status: 200 as const,
          body: {
            success: true,
            hits: results
              .filter((r) => r.document_id === documentId)
              .map((r) => ({ index: r.chunk_index, similarity: r.similarity })),
            totalResults: results.length,
            scoped: false,
          },
        };
      }

      // Nutzer-Notebook: hier IST die Einschränkung möglich —
      // `getDocumentIdsFn` wird zum documentIds-Filter (NotebookQAService.ts:704).
      const notebook = await notebookHelper.getNotebookCollection(collection);
      if (!notebook) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Sammlung nicht gefunden.' },
        };
      }

      // `getDocumentIdsFn` unten schränkt die Suche nur ein — es prüft nicht,
      // ob das Dokument überhaupt zu diesem Notebook gehört. Ohne diese
      // Prüfung würde jede beliebige documentId mit der Kennung der
      // Eigentümerin durchsuchbar, solange die Sammlung existiert.
      if (!(await notebookHelper.isDocumentInCollection(collection, documentId))) {
        return {
          status: 404 as const,
          body: { success: false, message: 'Dieses Dokument liegt nicht in dieser Sammlung.' },
        };
      }

      const context = await notebookQAService.getSearchContext({
        question: query,
        collectionId: collection,
        // Mit der Kennung der EIGENTÜMERIN, nicht der des Admins: derselbe Zweig
        // ruft `checkNotebookAccess` (NotebookQAService.ts:701-706), und ein
        // Instanz-Admin ist darin kein Mitglied. Der Inspektor misst damit
        // exakt den Pfad, den die Eigentümerin misst; die Zugriffsentscheidung
        // ist oben mit `requireInstanceAdmin` bereits gefallen.
        userId: notebook.user_id,
        getCollectionFn: async () => notebook,
        getDocumentIdsFn: async () => [documentId],
      });
      const scopedResults = context?.sortedResults ?? [];
      return {
        status: 200 as const,
        body: {
          success: true,
          hits: scopedResults
            .filter((r) => r.document_id === documentId)
            .map((r) => ({ index: r.chunk_index, similarity: r.similarity })),
          totalResults: scopedResults.length,
          scoped: true,
        },
      };
    } catch (error) {
      log.error('[chunkInspector.inspectSearch] Error:', error);
      return {
        status: 500 as const,
        body: { success: false, message: 'Die Suche ist fehlgeschlagen.' },
      };
    }
  },
});

export function mountChunkInspectorContractRouter(app: Application): void {
  createExpressEndpoints(chunkInspectorContract, chunkInspectorContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'chunkInspectorContract'),
  });
}

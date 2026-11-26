/**
 * Eine im Chat benannte Webseite wird ein Dokument des Threads — wie ein
 * angehängter Text, nicht wie ein Suchtreffer (#6103).
 *
 * Bis 11/2026 las der Loop eine benannte Seite als 8k-Destillat in eine
 * Quellenzeile. Was dort nicht hineinpasste, war weg, ohne dass Modell oder
 * Person es erfuhren. Eine lange Seite geht jetzt denselben Weg wie ein langer
 * Anhang (`contextEnrichmentService`, Pfad A): ganzer Text als `documents`-Zeile
 * mit Chunks, eine `chat_thread_attachments`-Zeile mit `document_id`, und ab da
 * gilt alles, was für Anhänge gilt — der Vorab-Abruf (`seedAttachedDocuments`),
 * `dokumente_lesen` mit Abschnitt, Seite, Wortsuche und Zitat, das Mitführen in
 * Folge-Turns, der Papierkorb (der Thread stempelt alle Vektoren über die
 * Anhang-Zeile).
 *
 * Läuft VOR der Werkzeug-Montage: `dokumente_lesen` legt seine Quellenliste
 * beim Montieren fest und nennt die Namen in der Beschreibung. Eine Seite, die
 * erst im Vorab-Abruf danach Dokument würde, wäre in diesem Turn nicht lesbar.
 *
 * Kurze Seiten (unter der Schwelle) bleiben, was sie waren: eine Quelle, die
 * das Modell ganz sieht. Sie werden hier gelesen und für `seedAttachedPages`
 * abgelegt (`state.prefetchedPages`), damit niemand dieselbe Seite zweimal holt.
 */
import { WEBPAGE_ATTACHMENT_MIME } from '../../../../agents/langgraph/ChatGraph/nodes/buildDocumentSources.js';
import {
  type ChatGraphState,
  type SearchResult,
} from '../../../../agents/langgraph/ChatGraph/types.js';
import { createLogger } from '../../../../utils/logger.js';
import { attachedPageUrls, pageLabel, readNamedPages } from '../../agents/namedPages.js';

const log = createLogger('namedPageDocuments');

/**
 * Ab dieser Länge wird eine Seite ein Dokument. Dieselbe Zahl wie
 * `SMALL_DOC_VECTORIZATION_THRESHOLD` für Anhänge — und dieselbe wie
 * `CRAWL_SNIPPET_CHARS`: darunter sieht das Modell die Seite in der
 * Quellenzeile ganz, darüber liest es sie als Dokument nach.
 */
export const PAGE_DOCUMENT_THRESHOLD = 12_000;

export interface NamedPageDocumentDeps {
  readNamedPages: typeof readNamedPages;
  /** Text → `documents`-Zeile mit Chunks, Rückgabe die Dokument-ID. */
  storeDocument: (input: {
    userId: string;
    label: string;
    title: string;
    text: string;
    sourceUrl: string;
  }) => Promise<string>;
  /** Die Anhang-Zeile, über die Folge-Turns und der Papierkorb das Dokument finden. */
  saveAttachment: (input: {
    threadId: string;
    userId: string;
    label: string;
    text: string;
    documentId: string;
  }) => Promise<void>;
}

async function defaultDeps(): Promise<NamedPageDocumentDeps> {
  const [
    { getPostgresDocumentService },
    { getQdrantDocumentService },
    { processFileUpload },
    persistence,
  ] = await Promise.all([
    import('../../../../services/document-services/PostgresDocumentService/index.js'),
    import('../../../../services/document-services/DocumentSearchService/index.js'),
    import('../../../../services/document-services/DocumentProcessingService/fileProcessing.js'),
    import('../attachmentPersistenceService.js'),
  ]);
  return {
    readNamedPages,
    storeDocument: async ({ userId, label, title, text, sourceUrl }) => {
      const buffer = Buffer.from(text, 'utf8');
      const result = await processFileUpload(
        getPostgresDocumentService(),
        getQdrantDocumentService(),
        userId,
        { buffer, mimetype: 'text/markdown', originalname: label, size: buffer.length },
        title,
        'documentchat',
        text,
        null,
        { sourceUrl }
      );
      return result.id;
    },
    saveAttachment: async ({ threadId, userId, label, text, documentId }) => {
      await persistence.saveThreadAttachment({
        threadId,
        messageId: null,
        userId,
        name: label,
        mimeType: WEBPAGE_ATTACHMENT_MIME,
        sizeBytes: Buffer.byteLength(text, 'utf8'),
        isImage: false,
        extractedText: text,
        documentId,
      });
    },
  };
}

/** Ist diese Seite in diesem Thread schon ein Dokument? Am Namen erkannt — siehe `pageLabel`. */
function isKnownDocument(state: ChatGraphState, label: string): boolean {
  return state.documentSources.some((s) => s.label === label);
}

/**
 * Liest die benannten Seiten dieses Turns und macht lange zu Dokumenten.
 * `allowed`: dieselbe Freigabe, die über `scrape_url` entscheidet
 * (`canReadNamedPages`) — ohne sie geht auch dieser Weg nicht ins Netz.
 * Wirft nie: eine Seite, die nicht Dokument werden konnte, bleibt eine
 * gekürzte Quelle mit Abdeckungsvermerk.
 */
export async function ingestNamedPages(params: {
  state: ChatGraphState;
  threadId: string | null;
  allowed: boolean;
  deps?: Partial<NamedPageDocumentDeps>;
}): Promise<void> {
  const { state, threadId, allowed } = params;
  const userId = state.agentConfig.userId ?? null;
  if (!allowed) return;
  const urls = attachedPageUrls(state).filter((url) => !isKnownDocument(state, pageLabel(url)));
  if (urls.length === 0) return;

  try {
    const deps = { ...(await defaultDeps()), ...params.deps };
    const { results } = await deps.readNamedPages(urls);
    const shortPages: SearchResult[] = [];
    for (const page of results) {
      const url = page.url ?? '';
      const label = pageLabel(url);
      if (!threadId || !userId || page.content.length < PAGE_DOCUMENT_THRESHOLD) {
        shortPages.push(page);
        continue;
      }
      try {
        const documentId = await deps.storeDocument({
          userId,
          label,
          title: page.title,
          text: page.content,
          sourceUrl: url,
        });
        await deps.saveAttachment({ threadId, userId, label, text: page.content, documentId });
        state.documentSources.push({ kind: 'document_chat', id: documentId, label, webpage: true });
        state.documentChatIds = [...(state.documentChatIds ?? []), documentId];
        state.documentChatLabels = { ...(state.documentChatLabels ?? {}), [documentId]: label };
        log.info(
          `[namedPageDocuments] ${url} → document ${documentId} (${page.content.length} chars)`
        );
      } catch (err) {
        // Lieber gekürzt mit Vermerk als gar nicht: die Quelle trägt
        // `totalChars`, und die Quellenzeile sagt, wie viel davon fehlt.
        log.warn(
          `[namedPageDocuments] ${url} could not become a document: ${err instanceof Error ? err.message : String(err)}`
        );
        shortPages.push(page);
      }
    }
    state.prefetchedPages = shortPages;
  } catch (err) {
    log.warn(
      `[namedPageDocuments] reading named pages failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

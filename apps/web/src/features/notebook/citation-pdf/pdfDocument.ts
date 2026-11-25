/**
 * Loads PDFs for the citation viewer. PDF.js and its worker are imported on
 * first use only, so neither lands in the notebook bundle.
 *
 * Documents load by range (`disableAutoFetch`): the original route answers
 * byte ranges, so opening page 40 of a 200-page Beschluss fetches the
 * cross-reference table and that page, not the whole file. One document is
 * shared by the side panel and the full-screen view; a few stay cached so
 * stepping between citations of different files does not refetch.
 */
import type * as PdfJsModule from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export type TextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;

type PdfJs = typeof PdfJsModule;

let pdfjsPromise: Promise<PdfJs> | null = null;

export function loadPdfJs(): Promise<PdfJs> {
  pdfjsPromise ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })().catch((error: unknown) => {
    pdfjsPromise = null;
    throw error;
  });
  return pdfjsPromise;
}

const MAX_CACHED = 3;

interface CachedDocument {
  promise: Promise<PDFDocumentProxy>;
  /** Set once PDF.js is loaded; destroying it frees the worker-side copy. */
  destroy: (() => Promise<void>) | null;
}

const cache = new Map<string, CachedDocument>();

export function loadPdfDocument(url: string): Promise<PDFDocumentProxy> {
  const cached = cache.get(url);
  if (cached) {
    // Re-insert: Map order is the eviction order.
    cache.delete(url);
    cache.set(url, cached);
    return cached.promise;
  }
  const entry: CachedDocument = { promise: Promise.resolve(null as never), destroy: null };
  entry.promise = loadPdfJs().then((pdfjs) => {
    const task = pdfjs.getDocument({ url, withCredentials: true, disableAutoFetch: true });
    entry.destroy = () => task.destroy();
    return task.promise;
  });
  entry.promise.catch(() => cache.delete(url));
  cache.set(url, entry);
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value as string;
    const evicted = cache.get(oldest);
    cache.delete(oldest);
    void evicted?.destroy?.().catch(() => undefined);
  }
  return entry.promise;
}

const pageTextCache = new WeakMap<PDFDocumentProxy, Map<number, Promise<TextContent>>>();

/**
 * The page's text content, cached: the search and the text layer read the same
 * object, so the matched item indices line up with the rendered spans.
 */
export function loadPageTextContent(
  doc: PDFDocumentProxy,
  pageNumber: number
): Promise<TextContent> {
  let perDoc = pageTextCache.get(doc);
  if (!perDoc) {
    perDoc = new Map();
    pageTextCache.set(doc, perDoc);
  }
  let content = perDoc.get(pageNumber);
  if (!content) {
    content = doc.getPage(pageNumber).then((page) => page.getTextContent());
    perDoc.set(pageNumber, content);
  }
  return content;
}

/**
 * The text items as the text layer creates spans for them: one per item with
 * a `str`, marked-content markers skipped (see pdf.js `TextLayer#processItems`).
 */
export function textItemsOf(content: TextContent): { str: string }[] {
  return content.items.flatMap((item) => ('str' in item ? [{ str: item.str }] : []));
}

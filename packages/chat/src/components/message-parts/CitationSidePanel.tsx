'use client';

import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Skeleton,
  useIsNarrowerThan,
} from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ExternalLink, FileText, X } from 'lucide-react';
import {
  memo,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from 'react';

import { useCitationPanel, type CitationPanelSource } from '../../context/CitationPanelContext';
import { findCitedRange } from '../../lib/citedTextRange';
import { cn } from '../../lib/utils';
import { useChatConfigStore } from '../../stores/chatConfigStore';

/** Below this the answer and the source cannot share a row, so the panel covers
 *  the surface as a modal sheet instead of narrowing the conversation to a column
 *  too thin to read. Measured on the notebook surface, not the window — the same
 *  surface also renders inside panels. */
const SIDE_BY_SIDE_MIN_WIDTH = 1024;

interface ChunkData {
  index: number;
  text: string;
  tokens: number;
  pageNumber?: number | null;
}

interface ChunksResponse {
  success: boolean;
  document_id: string;
  document_title: string;
  chunk_count: number;
  chunks: ChunkData[];
  /** The whole document as one text — the stored original where there is one,
   *  otherwise the chunks joined. Absent on older APIs. */
  full_text?: string;
  /** Where each chunk sits inside `full_text`. */
  chunk_map?: ChunkLocator[];
  /** Only manual uploads keep their file; absent on older APIs. */
  has_original?: boolean;
  original_mimetype?: string | null;
}

interface ChunkLocator {
  index: number;
  charStart: number;
  charEnd: number;
}

interface DocumentChunks {
  chunks: ChunkData[];
  fullText: string;
  chunkMap: ChunkLocator[];
  /** Set when the upload is stored and GET /:id/original can serve it. */
  original: { mimetype: string | null } | null;
}

/** `VITE_API_BASE_URL` already ends in `/api`; the web app falls back to the
 *  same-origin proxy. Same default as the notebook reader's „Original öffnen". */
const API_BASE_URL =
  (import.meta.env as unknown as Record<string, string | undefined>).VITE_API_BASE_URL ?? '/api';

/** One citation of the open document, as the original viewer needs it. */
export interface CitationPdfMark {
  citationId: number;
  /** Page the ingest recorded for the chunk; missing for many scraped PDFs. */
  page: number | null;
  /** Texts to look for, most precise first: the backing sentence, the cited excerpt, then the chunk. */
  texts: string[];
}

export interface CitationOriginalViewerProps {
  /** The stored original, without a `#page` fragment. */
  url: string;
  title: string;
  /** Every citation of the answer that points into this document. */
  marks: CitationPdfMark[];
  /** Index into `marks` of the citation the panel shows. */
  activeIndex: number;
  onSelect: (markIndex: number) => void;
  /** Back to the extracted text, where the passage is always marked. */
  onShowText: () => void;
}

/**
 * A viewer for stored originals, supplied by the app: PDF.js lives in the web
 * app only, so this package (which mobile also imports) never pulls it in.
 */
export interface CitationOriginalViewer {
  component: ComponentType<CitationOriginalViewerProps>;
  /** Starts loading the viewer's code, e.g. on hover over „PDF". */
  preload?: () => void;
}

type PanelView = 'text' | 'pdf';
const VIEW_STORAGE_KEY = 'gruenerator.citationPanel.view';

function readStoredView(): PanelView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'pdf' ? 'pdf' : 'text';
  } catch {
    return 'text';
  }
}

function storeView(view: PanelView) {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  } catch {
    // Private windows: the choice simply is not remembered.
  }
}

function isPdfOriginal(mimetype: string | null, title: string): boolean {
  return mimetype === 'application/pdf' || (!mimetype && /\.pdf$/i.test(title));
}

/** The answer's citations into the same document, with what the viewer needs to find them. */
function marksForDocument(
  sources: CitationPanelSource[],
  source: CitationPanelSource,
  chunks: ChunkData[]
): { marks: CitationPdfMark[]; sourceIndices: number[] } {
  const marks: CitationPdfMark[] = [];
  const sourceIndices: number[] = [];
  sources.forEach((s, i) => {
    if (s.documentId !== source.documentId || s.collectionId !== source.collectionId) return;
    const chunk = chunks.find((c) => c.index === s.chunkIndex);
    const texts = [s.quote, s.citedText, chunk?.text].filter(
      (t, i, all): t is string => Boolean(t?.trim()) && all.indexOf(t) === i
    );
    marks.push({ citationId: s.citationId, page: chunk?.pageNumber ?? null, texts });
    sourceIndices.push(i);
  });
  return { marks, sourceIndices };
}

/** Header, body and footer share one gutter, so the left edge of every line —
 *  label, quote, page note — stacks. 28px: wide enough that the quote card's
 *  own inset does not read as a second, competing margin. */
const GUTTER = 'px-7';
const LABEL_CLS = 'text-xs font-bold uppercase tracking-[0.08em] text-foreground-muted';
/** Literal classes — Tailwind scans source text, so a computed `w-${x}` yields
 *  no CSS at all. */
const SKELETON_LINES = [
  { id: 'a', width: 'w-3/4' },
  { id: 'b', width: 'w-full' },
  { id: 'c', width: 'w-full' },
  { id: 'd', width: 'w-5/6' },
  { id: 'e', width: 'w-full' },
  { id: 'f', width: 'w-2/3' },
  { id: 'g', width: 'w-full' },
  { id: 'h', width: 'w-4/5' },
];

/** 17.5px/1.7 — the panel is a reading surface, not a metadata list. At the 14px
 *  the rest of the chat chrome uses, a page of source text is work to get
 *  through; the line height matters as much as the size. */
const BODY_CLS = 'whitespace-pre-wrap text-[1.09375rem] leading-[1.7]';

/** "PDF", "DOCX" — the left half of the origin chip. Falls back to the file
 *  extension, read from the last path segment only: a bare host would otherwise
 *  hand back its TLD ("example.org" → "ORG"). */
function documentKind(contentType?: string, sourceUrl?: string): string | null {
  if (contentType) {
    const short = contentType.split('/').pop()?.split(';')[0]?.trim();
    if (short && short.length <= 5) return short.toUpperCase();
  }
  const lastSegment = sourceUrl?.split(/[?#]/)[0]?.split('/').pop() ?? '';
  const extension = lastSegment.includes('.') ? lastSegment.split('.').pop() : null;
  if (extension && /^[a-z]{2,5}$/i.test(extension)) return extension.toUpperCase();
  return null;
}

/** „PDF öffnen", „DOCX öffnen", „Bild öffnen" — the button says what opens. */
function originalLabel(mimetype: string | null, documentTitle: string): string {
  if (mimetype?.startsWith('image/')) return 'Bild öffnen';
  const kind = documentKind(mimetype ?? undefined, documentTitle);
  return kind ? `${kind} öffnen` : 'Original öffnen';
}

function originalHref(documentId: string, notebookId: string, page: number | null): string {
  const query = notebookId ? `?notebookId=${encodeURIComponent(notebookId)}` : '';
  // `#page=N` is the PDF open parameter the browser viewers read; other types ignore it.
  const fragment = page ? `#page=${page}` : '';
  return `${API_BASE_URL}/documents/${encodeURIComponent(documentId)}/original${query}${fragment}`;
}

/** The document as the API built it before it sent `full_text`: the chunks
 *  joined, each located in the result. */
function joinChunks(chunks: ChunkData[]): { fullText: string; chunkMap: ChunkLocator[] } {
  let fullText = '';
  const chunkMap = chunks.map((c) => {
    if (fullText) fullText += '\n\n';
    const charStart = fullText.length;
    fullText += c.text;
    return { index: c.index, charStart, charEnd: fullText.length };
  });
  return { fullText, chunkMap };
}

/**
 * Where the panel marks the citation inside the whole document: the quoted words
 * within the cited chunk, else anywhere in the text, else the cited chunk
 * itself. `null` only when neither the quote nor the chunk can be placed — an
 * unmarked document beats a mark in the wrong place.
 */
function citedRangeInDocument(
  text: string,
  chunkMap: ChunkLocator[],
  source: CitationPanelSource
): [number, number] | null {
  const find = (haystack: string) =>
    findCitedRange(haystack, source.quote) ?? findCitedRange(haystack, source.citedText);
  const chunk = chunkMap.find((c) => c.index === source.chunkIndex);
  if (chunk) {
    const inner = find(text.slice(chunk.charStart, chunk.charEnd));
    if (inner) return [chunk.charStart + inner[0], chunk.charStart + inner[1]];
  }
  const anywhere = find(text);
  if (anywhere) return anywhere;
  return chunk && chunk.charEnd > chunk.charStart ? [chunk.charStart, chunk.charEnd] : null;
}

/** Viele Quellen sind kurze Einzelseiten (ein LV-Beschluss, ein Artikel) — ohne
 *  sichtbare Grenzen liest sich ein vollständiges kurzes Dokument wie ein
 *  abgeschnittenes, besonders wenn die zitierte Passage ganz oben sitzt. */
function DocumentBoundary({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-3">
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
      <span className={LABEL_CLS}>{label}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-border" />
    </div>
  );
}

function CitationPanelBody({
  titleId,
  originalViewer,
}: {
  titleId: string;
  originalViewer?: CitationOriginalViewer;
}) {
  const { source, sources, activeIndex, goTo, close } = useCitationPanel();
  const citedRef = useRef<HTMLElement | null>(null);

  const documentId = source?.documentId;
  const collectionId = source?.collectionId;

  const chunksQuery = useQuery<DocumentChunks, Error>({
    queryKey: ['document-chunks', documentId, collectionId],
    queryFn: async ({ signal }) => {
      const { fetch: configFetch } = useChatConfigStore.getState();
      const query = new URLSearchParams();
      if (collectionId) query.set('collectionId', collectionId);
      // documentId kann eine Quell-URL sein (gescrapte Systemsammlungen wie
      // KommunalWiki) — und eine URL überlebt den Pfad nicht: der
      // Reverse-Proxy dekodiert %2F und merged Slashes, bevor Express routet.
      // URL-förmige IDs reisen deshalb im Query-String (GET /chunks).
      let requestUrl: string;
      if (/^https?:\/\//.test(documentId ?? '')) {
        query.set('documentId', documentId ?? '');
        requestUrl = `/api/documents/chunks?${query.toString()}`;
      } else {
        const qs = query.toString();
        requestUrl = `/api/documents/${encodeURIComponent(documentId ?? '')}/chunks${qs ? `?${qs}` : ''}`;
      }
      const response = await configFetch(requestUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as ChunksResponse;
      if (!data.success || data.chunks.length === 0) {
        throw new Error('Keine Inhalte gefunden');
      }
      return {
        chunks: data.chunks,
        ...(data.full_text && data.chunk_map
          ? { fullText: data.full_text, chunkMap: data.chunk_map }
          : joinChunks(data.chunks)),
        original: data.has_original ? { mimetype: data.original_mimetype ?? null } : null,
      };
    },
    enabled: Boolean(documentId),
    staleTime: 5 * 60 * 1000,
  });

  const chunks = useMemo(() => chunksQuery.data?.chunks ?? [], [chunksQuery.data]);
  const original = chunksQuery.data?.original ?? null;
  const [view, setView] = useState<PanelView>(readStoredView);
  const chooseView = useCallback((next: PanelView) => {
    setView(next);
    storeView(next);
  }, []);
  const documentMarks = useMemo(
    () => (source ? marksForDocument(sources, source, chunks) : null),
    [sources, source, chunks]
  );
  const cited = source ? (chunks.find((c) => c.index === source.chunkIndex) ?? null) : null;
  const fullText = chunksQuery.data?.fullText ?? '';
  const citedRange = useMemo(
    () =>
      source && chunksQuery.data
        ? citedRangeInDocument(fullText, chunksQuery.data.chunkMap, source)
        : null,
    [fullText, chunksQuery.data, source]
  );

  // Bring the quoted passage into view — on open AND on every step through the
  // footer, where the element stays mounted and only its content changes.
  useEffect(() => {
    const el = citedRef.current;
    if (!el) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(
      () => el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' }),
      80
    );
    return () => clearTimeout(timer);
  }, [activeIndex, citedRange]);

  if (!source) return null;

  const error = chunksQuery.error
    ? chunksQuery.error.message === 'Keine Inhalte gefunden'
      ? 'Keine Inhalte gefunden'
      : 'Inhalte konnten nicht geladen werden'
    : null;

  const page = cited?.pageNumber ?? null;
  const Viewer =
    originalViewer && original && isPdfOriginal(original.mimetype, source.documentTitle)
      ? originalViewer.component
      : null;
  const showPdf = Viewer !== null && view === 'pdf';
  // With a stored original the button names the file type and carries the
  // page; without one, both stay as plain text so neither gets lost.
  const kind = original ? null : documentKind(source.contentType, source.sourceUrl);
  const originLabel = [kind, source.collectionName].filter(Boolean).join(' · ');
  const pageLabel = !original && page ? `Seite ${page}` : null;

  return (
    <>
      <header
        className={cn('flex shrink-0 flex-col gap-2.5 border-b border-border pb-4 pt-5', GUTTER)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex size-[1.625rem] shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white dark:bg-primary-500 dark:text-primary-950"
            >
              {source.citationId}
            </span>
            <h2
              id={titleId}
              /* m-0 defeats the global h2 margin; Raleway comes from the same
                 global rule and is what the design asks for. */
              className="m-0 truncate text-base font-bold text-foreground-heading"
              title={source.documentTitle}
            >
              {source.documentTitle}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {source.sourceUrl && (
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="size-8 pointer-coarse:size-11"
                title="Quelle öffnen"
              >
                <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  <span className="sr-only">Quelle in neuem Tab öffnen</span>
                </a>
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8 pointer-coarse:size-11"
              onClick={close}
              title="Schließen"
            >
              <X className="size-4" />
              <span className="sr-only">Seitenleiste schließen</span>
            </Button>
          </div>
        </div>
        {(originLabel || pageLabel || original) && (
          <div className="flex flex-wrap items-center gap-2 text-[0.84375rem] text-foreground-muted">
            {originLabel && (
              <span className="rounded-md border border-border bg-background-alt px-2.5 py-[3px]">
                {originLabel}
              </span>
            )}
            {pageLabel && <span>{pageLabel}</span>}
            {Viewer && (
              <div
                role="group"
                aria-label="Ansicht"
                className="inline-flex gap-0.5 rounded-lg border border-border bg-background p-0.5"
              >
                {(['text', 'pdf'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => chooseView(v)}
                    onPointerEnter={v === 'pdf' ? originalViewer?.preload : undefined}
                    onFocus={v === 'pdf' ? originalViewer?.preload : undefined}
                    className={cn(
                      'min-h-7 rounded-md px-3 text-[0.82rem] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:min-h-10',
                      view === v
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/50 dark:text-primary-200'
                        : 'text-foreground-muted hover:text-foreground'
                    )}
                  >
                    {v === 'text' ? 'Text' : 'PDF'}
                  </button>
                ))}
              </div>
            )}
            {original && !Viewer && (
              <a
                href={originalHref(source.documentId, source.collectionId, page)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-7 items-center gap-1.5 rounded-md border border-primary-600 bg-background px-2.5 py-[3px] font-semibold text-primary-700 transition-colors hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none pointer-coarse:min-h-11 dark:border-primary-400 dark:text-primary-300 dark:hover:bg-primary-900/40"
              >
                <FileText aria-hidden="true" className="size-3.5" />
                {originalLabel(original.mimetype, source.documentTitle)}
                {page ? (
                  <>
                    <span aria-hidden="true" className="font-normal text-foreground-muted">
                      · S. {page}
                    </span>
                    <span className="sr-only">, Seite {page}</span>
                  </>
                ) : null}
              </a>
            )}
          </div>
        )}
      </header>

      {showPdf && documentMarks && (
        <Suspense
          fallback={
            <div className="flex-1 p-4" aria-busy="true">
              <Skeleton className="mx-auto aspect-[1/1.414] w-full max-w-[32rem]" />
            </div>
          }
        >
          <Viewer
            url={originalHref(source.documentId, source.collectionId, null)}
            title={source.documentTitle}
            marks={documentMarks.marks}
            activeIndex={Math.max(0, documentMarks.sourceIndices.indexOf(activeIndex))}
            onSelect={(i) => goTo(documentMarks.sourceIndices[i] ?? activeIndex)}
            onShowText={() => chooseView('text')}
          />
        </Suspense>
      )}

      {/* pb-10: the last line of a document should be scrollable clear of the
          footer, not welded to it. */}
      <div hidden={showPdf} className={cn('min-h-0 flex-1 overflow-y-auto pb-10 pt-6', GUTTER)}>
        {chunksQuery.isLoading && (
          <div className="flex flex-col gap-3">
            {SKELETON_LINES.map((line) => (
              <Skeleton key={line.id} className={cn('h-4', line.width)} />
            ))}
          </div>
        )}

        {error && (
          <p
            role="status"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        {/* The whole document as one text, only the citation marked. Re-indexing
            renumbers chunks, so an older answer can point past the end — then the
            document still shows, only the mark is lost. */}
        {!error && fullText && (
          <>
            <DocumentBoundary label="Anfang des Dokuments" />
            <p className={cn(BODY_CLS, 'mb-5 text-foreground')}>
              {citedRange ? (
                <>
                  {fullText.slice(0, citedRange[0])}
                  <mark
                    ref={citedRef}
                    className="rounded-sm bg-primary-100 px-0.5 text-foreground dark:bg-primary-800 dark:text-primary-50"
                  >
                    {fullText.slice(citedRange[0], citedRange[1])}
                  </mark>
                  {fullText.slice(citedRange[1])}
                </>
              ) : (
                fullText
              )}
            </p>
          </>
        )}

        {chunks.length > 0 && (
          <>
            <DocumentBoundary label="Ende des Dokuments" />
            {source.sourceUrl && (
              <Button asChild variant="outline" className="w-full">
                <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Vollständige Quelle öffnen
                </a>
              </Button>
            )}
          </>
        )}
      </div>

      {sources.length > 1 && (
        <footer
          className={cn(
            'flex shrink-0 items-center justify-between gap-3 border-t border-border py-3.5',
            GUTTER
          )}
        >
          <span className="text-[0.84375rem] text-foreground-muted">
            Zitat {activeIndex + 1} von {sources.length}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={activeIndex === 0}
              onClick={() => goTo(activeIndex - 1)}
            >
              <ChevronLeft className="size-4" />
              Zurück
            </Button>
            <Button
              variant="brand"
              size="sm"
              disabled={activeIndex === sources.length - 1}
              onClick={() => goTo(activeIndex + 1)}
            >
              Weiter
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </footer>
      )}
    </>
  );
}

/**
 * The source reader. Wide surfaces get it as a third column so the answer stays
 * readable beside its evidence — the whole point of looking a citation up. Only
 * where that no longer fits does it become a modal sheet.
 *
 * `containerRef` must point at the row the panel shares with the conversation:
 * the decision is about the space those two split, not about the window.
 */
export const CitationSidePanel = memo(function CitationSidePanel({
  containerRef,
  originalViewer,
}: {
  containerRef: RefObject<HTMLElement | null>;
  /** Renders stored PDF originals in the panel; without it they open in a new tab. */
  originalViewer?: CitationOriginalViewer;
}) {
  const { isOpen, close } = useCitationPanel();
  const narrow = useIsNarrowerThan(containerRef, SIDE_BY_SIDE_MIN_WIDTH);
  const titleId = useId();

  // Escape closes the inline column too. The sheet brings its own handler, and
  // registering both would be harmless but redundant.
  useEffect(() => {
    if (!isOpen || narrow) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, narrow, close]);

  if (!isOpen) return null;

  if (narrow) {
    return (
      <Sheet open onOpenChange={(next) => !next && close()}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex w-full flex-col gap-0 p-0 sm:max-w-[35rem]"
        >
          <SheetTitle className="sr-only">Quelle im Dokument</SheetTitle>
          <SheetDescription className="sr-only">
            Der zitierte Abschnitt im Originaltext, mit dem Text davor und danach.
          </SheetDescription>
          <CitationPanelBody titleId={titleId} originalViewer={originalViewer} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      aria-labelledby={titleId}
      /* 440–680px, ideally ~42% of the row: below 440 the quote card's inset
         eats the measure, above 680 the line gets too long to track. */
      className="flex w-[clamp(27.5rem,42%,42.5rem)] shrink-0 flex-col border-l border-border bg-background-alt motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-3 motion-safe:duration-300"
    >
      <CitationPanelBody titleId={titleId} originalViewer={originalViewer} />
    </aside>
  );
});

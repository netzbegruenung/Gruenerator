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
import { ChevronLeft, ChevronRight, ExternalLink, X } from 'lucide-react';
import { memo, useEffect, useId, useMemo, useRef, type RefObject } from 'react';

import { useCitationPanel } from '../../context/CitationPanelContext';
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

function CitedChunk({ text, citedText }: { text: string; citedText?: string }) {
  const range = useMemo(() => findCitedRange(text, citedText), [text, citedText]);
  if (!range) return <>{text}</>;
  const [start, end] = range;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-primary-100 px-0.5 text-foreground dark:bg-primary-800 dark:text-primary-50">
        {text.slice(start, end)}
      </mark>
      {text.slice(end)}
    </>
  );
}

/** `muted` steps the surrounding text back from the quoted passage. It is a
 *  colour token, never `opacity` — opacity would drag every child's contrast
 *  down with it. */
function ContextRegion({
  label,
  chunks,
  muted = true,
}: {
  label: string;
  chunks: ChunkData[];
  muted?: boolean;
}) {
  if (chunks.length === 0) return null;
  return (
    <>
      <p className={cn(LABEL_CLS, 'mb-3.5')}>{label}</p>
      <p className={cn(BODY_CLS, 'mb-5', muted ? 'text-foreground-muted' : 'text-foreground')}>
        {chunks.map((chunk) => chunk.text).join('\n\n')}
      </p>
    </>
  );
}

function CitationPanelBody({ titleId }: { titleId: string }) {
  const { source, sources, activeIndex, goTo, close } = useCitationPanel();
  const citedRef = useRef<HTMLDivElement | null>(null);

  const documentId = source?.documentId;
  const collectionId = source?.collectionId;

  const chunksQuery = useQuery<ChunkData[], Error>({
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
      const data: ChunksResponse = await response.json();
      if (!data.success || data.chunks.length === 0) {
        throw new Error('Keine Inhalte gefunden');
      }
      return data.chunks;
    },
    enabled: Boolean(documentId),
    staleTime: 5 * 60 * 1000,
  });

  const chunks = useMemo(() => chunksQuery.data ?? [], [chunksQuery.data]);
  const citedPosition = source ? chunks.findIndex((c) => c.index === source.chunkIndex) : -1;
  const cited = citedPosition === -1 ? null : chunks[citedPosition];

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
  }, [activeIndex, cited]);

  if (!source) return null;

  const error = chunksQuery.error
    ? chunksQuery.error.message === 'Keine Inhalte gefunden'
      ? 'Keine Inhalte gefunden'
      : 'Inhalte konnten nicht geladen werden'
    : null;

  const kind = documentKind(source.contentType, source.sourceUrl);
  const originLabel = [kind, source.collectionName].filter(Boolean).join(' · ');
  const positionLabel =
    citedPosition === -1
      ? null
      : [
          `Abschnitt ${citedPosition + 1} von ${chunks.length}`,
          cited?.pageNumber ? `Seite ${cited.pageNumber}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

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
        {(originLabel || positionLabel) && (
          <div className="flex flex-wrap items-center gap-2 text-[0.84375rem] text-foreground-muted">
            {originLabel && (
              <span className="rounded-md border border-border bg-background-alt px-2.5 py-[3px]">
                {originLabel}
              </span>
            )}
            {positionLabel && <span>{positionLabel}</span>}
          </div>
        )}
      </header>

      {/* pb-10: the last line of a document should be scrollable clear of the
          footer, not welded to it. */}
      <div className={cn('min-h-0 flex-1 overflow-y-auto pb-10 pt-6', GUTTER)}>
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

        {cited && (
          <>
            <ContextRegion label="Kontext davor" chunks={chunks.slice(0, citedPosition)} />

            <div
              ref={citedRef}
              className="mb-5 rounded-r-xl border-l-[3px] border-primary-500 bg-primary-50 px-[1.375rem] py-5 dark:bg-primary-900/40"
            >
              <p className={cn(LABEL_CLS, 'mb-3 text-primary-700 dark:text-primary-300')}>
                Zitierte Passage
              </p>
              <p className={cn(BODY_CLS, 'text-foreground')}>
                <CitedChunk text={cited.text} citedText={source.citedText} />
              </p>
            </div>

            <ContextRegion label="Kontext danach" chunks={chunks.slice(citedPosition + 1)} />
          </>
        )}

        {/* The chunk the citation names is missing — re-indexing renumbers chunks,
            so an older answer can point past the end. The document itself is still
            worth showing; only the highlight is lost. */}
        {!cited && !error && chunks.length > 0 && (
          <ContextRegion label="Originaltext" chunks={chunks} muted={false} />
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
}: {
  containerRef: RefObject<HTMLElement | null>;
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
          <CitationPanelBody titleId={titleId} />
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
      <CitationPanelBody titleId={titleId} />
    </aside>
  );
});

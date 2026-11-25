import { type CitationOriginalViewerProps } from '@gruenerator/chat';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Skeleton,
  useContainerWidth,
} from '@gruenerator/ui';
import { ArrowLeft, ExternalLink, Info, Maximize2, Minus, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { loadPdfDocument, loadPdfJs } from './pdfDocument';
import { PdfPage, type PageHighlight } from './PdfPage';
import { useCitationMatches, type MarkLocation } from './useCitationMatches';

import type { PDFDocumentProxy } from 'pdfjs-dist';

import './citationPdf.css';

import { cn } from '@/utils/cn';

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2];
const DEFAULT_ASPECT = Math.SQRT2;

function usePdfDocument(url: string) {
  // Keyed by URL: a result for the previous document never shows for the next.
  const [loaded, setLoaded] = useState<{
    url: string;
    value: { doc: PDFDocumentProxy; aspect: number } | 'error';
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadPdfDocument(url)
      .then(async (doc) => {
        const first = (await doc.getPage(1)).getViewport({ scale: 1 });
        const aspect = first.height / first.width || DEFAULT_ASPECT;
        if (!cancelled) setLoaded({ url, value: { doc, aspect } });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ url, value: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return loaded && loaded.url === url ? loaded.value : 'loading';
}

/** The list shows prose, not the ingest's markdown and image markers. */
function previewText(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|\s)#{1,6}\s+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Vertical scroll inside the page column only. `scrollIntoView` would also
 * scroll every ancestor, sideways too — a highlight reaching past the page
 * edge shifted the whole side sheet on phones.
 */
function scrollWithin(
  container: HTMLElement,
  el: Element,
  block: 'start' | 'center',
  smooth: boolean
) {
  const box = container.getBoundingClientRect();
  const target = el.getBoundingClientRect();
  const offset = block === 'center' ? (box.height - target.height) / 2 : 12;
  container.scrollTo({
    top: container.scrollTop + (target.top - box.top) - offset,
    behavior: smooth ? 'smooth' : 'auto',
  });
}

function pageOf(location: MarkLocation | undefined): number | null {
  if (!location) return null;
  return location.status === 'found' || location.status === 'page-only' ? location.page : null;
}

function highlightsByPage(
  locations: MarkLocation[],
  activeIndex: number
): Map<number, PageHighlight[]> {
  const map = new Map<number, PageHighlight[]>();
  locations.forEach((l, i) => {
    if (l.status !== 'found') return;
    const list = map.get(l.page) ?? [];
    list.push({ ...l.match, active: i === activeIndex });
    map.set(l.page, list);
  });
  return map;
}

/** Says why the passage is not marked; nothing when it is. */
function MatchNotice({
  location,
  onShowText,
}: {
  location: MarkLocation | undefined;
  onShowText: () => void;
}) {
  if (!location || location.status === 'found') return null;
  const text =
    location.status === 'searching'
      ? null
      : location.status === 'page-only' && location.reason === 'no-text'
        ? `Gescannte Seite ${location.page}: Die Stelle lässt sich hier nicht markieren.`
        : location.status === 'page-only'
          ? `Stelle auf Seite ${location.page} nicht genau gefunden. Der Text der PDF weicht vom ausgelesenen Text ab.`
          : 'Stelle in der PDF nicht gefunden. Der Text der PDF weicht vom ausgelesenen Text ab.';
  if (!text) return null;
  return (
    <div
      role="status"
      className="mx-4 my-3 flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[0.84rem] text-foreground"
    >
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground-muted" />
      <span>
        {text}{' '}
        <button
          type="button"
          onClick={onShowText}
          className="font-semibold text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
        >
          Als Text anzeigen
        </button>
      </span>
    </div>
  );
}

/** The pages of one document, scrolled to the active citation. */
function PdfPages({
  doc,
  aspect,
  zoom,
  locations,
  activeIndex,
  className,
}: {
  doc: PDFDocumentProxy;
  aspect: number;
  zoom: number;
  locations: MarkLocation[];
  activeIndex: number;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const containerWidth = useContainerWidth(scrollRef);
  const width = Math.max(0, Math.floor((containerWidth - 32) * zoom));
  const byPage = useMemo(() => highlightsByPage(locations, activeIndex), [locations, activeIndex]);
  const active = locations[activeIndex];
  const activePage = pageOf(active);

  // Two scrolls per citation step, each once: first to the page (which makes
  // it render), then — when its spans are marked — onto the passage. The
  // highlight callback fires again on every re-render of the page's spans and
  // must not yank the reader back.
  const pageScrolledFor = useRef<string | null>(null);
  const markScrolledFor = useRef<string | null>(null);
  const stepKey = `${activeIndex}:${active?.status ?? ''}:${activePage ?? ''}`;
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const onActiveHighlight = useCallback(
    (el: HTMLElement) => {
      if (markScrolledFor.current === stepKey) return;
      markScrolledFor.current = stepKey;
      if (scrollRef.current) scrollWithin(scrollRef.current, el, 'center', !reduced);
    },
    [stepKey, reduced]
  );

  useEffect(() => {
    if (!activePage || width <= 0 || pageScrolledFor.current === stepKey) return;
    const container = scrollRef.current;
    const pageEl = container?.querySelector(`[data-page="${activePage}"]`);
    if (!container || !pageEl) return;
    pageScrolledFor.current = stepKey;
    // Instant: the page has to be in view before it renders and can be marked.
    scrollWithin(container, pageEl, 'start', false);
  }, [activePage, stepKey, width]);

  return (
    <div
      ref={(el) => {
        scrollRef.current = el;
        setScrollEl(el);
      }}
      className={cn(
        'min-h-0 flex-1 overflow-auto bg-[#3a3f39] px-4 py-4 dark:bg-[#0b0e0b]',
        className
      )}
    >
      {width > 0 && (
        <div className="flex flex-col items-center gap-4">
          {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((p) => (
            <PdfPage
              key={p}
              doc={doc}
              pageNumber={p}
              width={width}
              aspect={aspect}
              root={scrollEl}
              highlights={byPage.get(p)}
              onActiveHighlight={p === activePage ? onActiveHighlight : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ZoomControls({ zoom, onZoom }: { zoom: number; onZoom: (z: number) => void }) {
  const index = ZOOM_STEPS.indexOf(zoom);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-inherit hover:bg-white/10 pointer-coarse:size-11"
        aria-label="Verkleinern"
        disabled={index <= 0}
        onClick={() => onZoom(ZOOM_STEPS[index - 1]!)}
      >
        <Minus aria-hidden />
      </Button>
      <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)} %</span>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-inherit hover:bg-white/10 pointer-coarse:size-11"
        aria-label="Vergrößern"
        disabled={index >= ZOOM_STEPS.length - 1}
        onClick={() => onZoom(ZOOM_STEPS[index + 1]!)}
      >
        <Plus aria-hidden />
      </Button>
    </>
  );
}

function OpenInTab({ url, page }: { url: string; page: number | null }) {
  return (
    <Button
      asChild
      variant="ghost"
      size="icon"
      className="size-8 text-inherit hover:bg-white/10 pointer-coarse:size-11"
    >
      <a
        href={page ? `${url}#page=${page}` : url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="In neuem Tab öffnen"
        title="In neuem Tab öffnen"
      >
        <ExternalLink aria-hidden />
      </a>
    </Button>
  );
}

function FullscreenViewer({
  open,
  onClose,
  props,
  doc,
  aspect,
  locations,
}: {
  open: boolean;
  onClose: () => void;
  props: CitationOriginalViewerProps;
  doc: PDFDocumentProxy;
  aspect: number;
  locations: MarkLocation[];
}) {
  const { marks, activeIndex, onSelect, title, url } = props;
  const [zoom, setZoom] = useState(1);
  const [thumbsEl, setThumbsEl] = useState<HTMLElement | null>(null);
  const activePage = pageOf(locations[activeIndex]);
  const pagesWithMarks = useMemo(() => {
    const counts = new Map<number, number>();
    locations.forEach((l) => {
      const p = pageOf(l);
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
    });
    return counts;
  }, [locations]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh max-h-none w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none sm:max-w-none data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100"
      >
        <DialogDescription className="sr-only">
          Die Original-PDF mit den zitierten Stellen markiert.
        </DialogDescription>
        <div className="flex min-h-14 items-center gap-2 border-b border-border px-2 sm:px-4">
          <Button variant="ghost" onClick={onClose} className="min-h-11 md:min-h-9">
            <ArrowLeft aria-hidden />
            Antwort
          </Button>
          <DialogTitle className="m-0 min-w-0 truncate text-base font-bold text-foreground-heading">
            {title}
          </DialogTitle>
          <div className="flex-1" />
          <div className="flex items-center gap-1 rounded-md bg-[#3a3f39] px-1 text-[0.8rem] text-[#e7ece5]">
            <ZoomControls zoom={zoom} onZoom={setZoom} />
            <OpenInTab url={url} page={activePage} />
          </div>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[112px_minmax(0,1fr)_300px]">
          <nav
            aria-label="Seiten"
            ref={setThumbsEl}
            className="hidden min-h-0 flex-col gap-5 overflow-y-auto bg-[#3a3f39] px-4 py-4 md:flex dark:bg-[#0b0e0b]"
          >
            {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((p) => {
              const count = pagesWithMarks.get(p);
              const target = locations.findIndex((l) => pageOf(l) === p);
              return (
                <button
                  key={p}
                  type="button"
                  aria-label={`Seite ${p}${count ? `, ${count} ${count === 1 ? 'Zitat' : 'Zitate'}` : ''}`}
                  aria-current={p === activePage ? 'page' : undefined}
                  onClick={() => target !== -1 && onSelect(target)}
                  disabled={target === -1}
                  className={cn(
                    'relative rounded-sm outline-offset-2 disabled:cursor-default',
                    p === activePage && 'outline outline-3 outline-primary-500'
                  )}
                >
                  <PdfPage
                    doc={doc}
                    pageNumber={p}
                    width={80}
                    aspect={aspect}
                    root={thumbsEl}
                    textLayer={false}
                  />
                  {count ? (
                    <span className="absolute -top-2 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[0.6rem] font-bold text-white">
                      {count}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-center text-[0.7rem] text-[#cfd6cc]">{p}</span>
                </button>
              );
            })}
          </nav>
          <PdfPages
            doc={doc}
            aspect={aspect}
            zoom={zoom}
            locations={locations}
            activeIndex={activeIndex}
          />
          <aside className="hidden min-h-0 flex-col gap-2.5 overflow-y-auto border-l border-border bg-background p-4 md:flex">
            <h2 className="m-0 text-xs font-bold tracking-[0.08em] text-foreground-muted uppercase">
              {marks.length} {marks.length === 1 ? 'Zitat' : 'Zitate'} in diesem Dokument
            </h2>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {marks.map((m, i) => {
                const l = locations[i];
                const page = pageOf(l);
                return (
                  <li key={m.citationId}>
                    <button
                      type="button"
                      onClick={() => onSelect(i)}
                      aria-current={i === activeIndex ? 'true' : undefined}
                      className={cn(
                        'grid w-full grid-cols-[1.5rem_minmax(0,1fr)] gap-2.5 rounded-xl border p-3 text-left text-[0.84rem] leading-snug transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                        i === activeIndex
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/40'
                          : 'border-border hover:border-primary-300'
                      )}
                    >
                      <span
                        className={cn(
                          'flex size-6 items-center justify-center rounded-full text-xs font-bold text-white',
                          l?.status === 'found' ? 'bg-primary-600' : 'bg-grey-500'
                        )}
                      >
                        {m.citationId}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-xs font-semibold text-foreground-muted">
                          {page
                            ? `Seite ${page}`
                            : l?.status === 'searching'
                              ? 'Wird gesucht …'
                              : 'Seite unbekannt'}
                          {l && l.status !== 'found' && l.status !== 'searching'
                            ? ' · nicht markiert'
                            : ''}
                        </span>
                        <span className="line-clamp-2 text-foreground">
                          {previewText(m.texts.at(-1) ?? '')}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
        {marks.length > 1 && (
          <div className="flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
            <span className="text-sm text-foreground-muted">
              Zitat {activeIndex + 1} von {marks.length}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={activeIndex === 0}
                onClick={() => onSelect(activeIndex - 1)}
              >
                Zurück
              </Button>
              <Button
                variant="brand"
                size="sm"
                className="min-h-11"
                disabled={activeIndex === marks.length - 1}
                onClick={() => onSelect(activeIndex + 1)}
              >
                Weiter
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Warms PDF.js and its worker before the first PDF is opened. */
export function preloadPdfJs(): void {
  void loadPdfJs().catch(() => undefined);
}

/**
 * The stored original of a cited document, rendered with PDF.js inside the
 * citation side panel. Pages render as they scroll into view; the cited
 * passages are found in the text layer (see `passageMatch.ts`) and marked.
 */
export default function CitationPdfViewer(props: CitationOriginalViewerProps) {
  const { url, marks, activeIndex, onShowText } = props;
  const state = usePdfDocument(url);
  const doc = typeof state === 'object' ? state.doc : null;
  const markInputs = useMemo(() => marks.map((m) => ({ page: m.page, texts: m.texts })), [marks]);
  const locations = useCitationMatches(doc, markInputs, activeIndex);
  const [zoom, setZoom] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const activePage = pageOf(locations[activeIndex]);

  if (state === 'error') {
    return (
      <div role="status" className="m-4 flex flex-col items-start gap-2 text-sm text-foreground">
        Die PDF konnte nicht geladen werden.
        <Button variant="outline" size="sm" onClick={onShowText}>
          Als Text anzeigen
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 bg-[#3a3f39] px-3 py-1 text-[0.8rem] text-[#e7ece5] dark:bg-[#0b0e0b]">
        <span className="tabular-nums">
          {doc
            ? activePage
              ? `Seite ${activePage} von ${doc.numPages}`
              : `${doc.numPages} Seiten`
            : 'PDF wird geladen …'}
        </span>
        <div className="flex-1" />
        <ZoomControls zoom={zoom} onZoom={setZoom} />
        <OpenInTab url={url} page={activePage} />
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-inherit hover:bg-white/10 pointer-coarse:size-11"
          aria-label="Im Vollbild öffnen"
          title="Im Vollbild öffnen"
          disabled={!doc}
          onClick={() => setFullscreen(true)}
        >
          <Maximize2 aria-hidden />
        </Button>
      </div>
      <MatchNotice location={locations[activeIndex]} onShowText={onShowText} />
      {typeof state === 'object' ? (
        <PdfPages
          doc={state.doc}
          aspect={state.aspect}
          zoom={zoom}
          locations={locations}
          activeIndex={activeIndex}
        />
      ) : (
        <div className="flex-1 bg-[#3a3f39] p-4 dark:bg-[#0b0e0b]" aria-busy="true">
          <Skeleton className="mx-auto aspect-[1/1.414] w-full max-w-[32rem] bg-white/15" />
        </div>
      )}
      {typeof state === 'object' && (
        <FullscreenViewer
          open={fullscreen}
          onClose={() => setFullscreen(false)}
          props={props}
          doc={state.doc}
          aspect={state.aspect}
          locations={locations}
        />
      )}
    </div>
  );
}

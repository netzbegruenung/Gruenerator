import { useEffect, useRef, useState } from 'react';

import { loadPageTextContent, loadPdfJs } from './pdfDocument';

import type { PassageMatch } from './passageMatch';
import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PageHighlight extends PassageMatch {
  active: boolean;
}

/** Device pixels per CSS pixel, capped: 3× canvases cost memory and add nothing legible. */
const MAX_DPR = 2;

/**
 * One PDF page. It renders only once it comes near the visible area (the
 * observer's `rootMargin` starts a page early enough that scrolling does not
 * land on a blank sheet); until then it is a correctly sized placeholder, so
 * a 200-page file costs 200 empty divs, not 200 canvases.
 */
export function PdfPage({
  doc,
  pageNumber,
  width,
  aspect,
  root,
  textLayer = true,
  highlights = [],
  onActiveHighlight,
  label,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  /** CSS pixels. */
  width: number;
  /** Height / width of the page, for the placeholder. */
  aspect: number;
  /** The scroll container; `null` uses the viewport. */
  root: HTMLElement | null;
  textLayer?: boolean;
  highlights?: PageHighlight[];
  /** Called with the first span of the active highlight once it is on the page. */
  onActiveHighlight?: (el: HTMLElement) => void;
  label?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [spans, setSpans] = useState<HTMLElement[] | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { root, rootMargin: '600px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [root, near]);

  useEffect(() => {
    if (!near || width <= 0) return;
    let cancelled = false;
    let cancelRender: (() => void) | null = null;
    void (async () => {
      const pdfjs = await loadPdfJs();
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      const task = page.render({
        canvas,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      });
      cancelRender = () => task.cancel();
      await task.promise.catch(() => undefined);
      if (cancelled || !textLayer) return;

      const container = textRef.current;
      if (!container) return;
      container.replaceChildren();
      hostRef.current?.style.setProperty('--total-scale-factor', String(viewport.scale));
      const layer = new pdfjs.TextLayer({
        textContentSource: await loadPageTextContent(doc, pageNumber),
        container,
        viewport,
      });
      await layer.render().catch(() => undefined);
      if (!cancelled) setSpans(layer.textDivs);
    })();
    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [doc, pageNumber, width, near, textLayer]);

  // Highlights change without re-rendering the page: only span classes move.
  useEffect(() => {
    if (!spans) return;
    for (const span of spans) span.classList.remove('cpdf-hl', 'cpdf-hl-active');
    let activeFirst: HTMLElement | null = null;
    for (const h of highlights) {
      for (let i = h.start; i <= h.end && i < spans.length; i++) {
        const span = spans[i]!;
        span.classList.add(h.active ? 'cpdf-hl-active' : 'cpdf-hl');
        if (h.active && !activeFirst && span.textContent) activeFirst = span;
      }
    }
    if (activeFirst) onActiveHighlight?.(activeFirst);
  }, [spans, highlights, onActiveHighlight]);

  return (
    <div
      ref={hostRef}
      className="cpdf-page"
      data-page={pageNumber}
      aria-label={label ?? `Seite ${pageNumber}`}
      role="group"
      style={{ width, minHeight: Math.floor(width * aspect) }}
    >
      <canvas ref={canvasRef} aria-hidden="true" />
      {textLayer && <div ref={textRef} className="textLayer" />}
    </div>
  );
}

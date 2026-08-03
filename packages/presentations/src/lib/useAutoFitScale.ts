import { PRESENTATION_MIN_SCALE, PRESENTATION_SCALE_LADDER } from '@gruenerator/contracts';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Ladder read that never yields undefined (indices are in range by
 * construction; the fallback just keeps the type honest). */
function step(index: number): number {
  return PRESENTATION_SCALE_LADDER[index] ?? PRESENTATION_MIN_SCALE;
}

/**
 * Largest ladder step that fits, searched outwards from `from`.
 *
 * Pure so the ladder walk is testable without a DOM: `fits` does the measuring.
 * It must be monotonic — a smaller scale never overflows more than a larger one
 * — which holds for text (smaller type is never taller). Given that, starting
 * from the previous step converges on the same answer as a full top-down scan
 * while costing 1–2 measurements instead of 6 on the common "content barely
 * changed" path. That matters: this runs on every keystroke.
 *
 * `fits` writes the scale it probes, so the last probe may leave the DOM on a
 * rejected step — callers must apply the returned value afterwards.
 */
export function pickScale(fits: (scale: number) => boolean, from: number): number {
  const start = PRESENTATION_SCALE_LADDER.indexOf(from);
  let i = start === -1 ? 0 : start;
  if (fits(step(i))) {
    while (i > 0 && fits(step(i - 1))) i -= 1;
  } else {
    while (i < PRESENTATION_SCALE_LADDER.length - 1) {
      i += 1;
      if (fits(step(i))) break;
    }
  }
  return step(i);
}

/**
 * Broadcast on `window` to make every mounted surface re-measure now.
 *
 * Needed because none of the passive triggers below can fire in the PDF export:
 * until reveal's PrintView has rebuilt the deck, every slide but the current one
 * is `display: none` and measures 0, where `fit` bails. By then the contentKey
 * layout effect has long run, `fonts.ready`/`loadingdone` are one-shot and may
 * have resolved earlier, and the viewport-rooted IntersectionObserver never
 * fires for slides in a print stack nobody scrolls. `.gruene-slide` is
 * `overflow: hidden`, so the failure is silent — clipped text in the PDF.
 *
 * Listeners bind `fit` directly, NOT `schedule`: dispatch then runs the fit
 * synchronously, so the caller can print immediately afterwards without an
 * assumption about rAF ordering.
 */
export const SLIDE_REFIT_EVENT = 'gruenerator:slides-refit';

/**
 * PowerPoint-style shrink-on-overflow for a fixed 960×540 slide surface.
 *
 * Measures the surface element itself (`scrollHeight` vs `clientHeight`) — the
 * body box never overflows on quote/title layouts (`flex: 0 0 auto`), the
 * surface does. Layout metrics are unaffected by the `transform: scale()`
 * ancestors (ScaledSlide, reveal) and by `visibility: hidden`, so every
 * instance measures in untransformed 960×540 space and converges to the same
 * step deterministically.
 *
 * The fit pass is imperative and synchronous: it writes `--gs-font-scale`
 * straight onto the node and re-measures per probe. The final setState only
 * mirrors the chosen step into render state — React bails out on equal values,
 * so there is no effect→state→effect loop.
 *
 * NOTE: `--gs-font-scale` has two writers — this hook imperatively, and
 * SlideSurface via its `style` prop from the returned `scale`. That is safe
 * only because every fit ends in `setScale(chosen)`: React's style diff writes
 * the property when its own rendered value changes, and it always converges on
 * the same number the DOM already holds. Keep that invariant if you touch this.
 *
 * The computed scale is render-local by design: writing it to the Y.Doc would
 * feed back between peers.
 */
export function useAutoFitScale(
  enabled: boolean,
  contentKey: string
): { ref: RefObject<HTMLDivElement | null>; scale: number } {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // Mirrors `scale` so the fit callback can read it without taking it as a
  // dependency (which would re-subscribe every listener on each fit).
  const scaleRef = useRef(1);

  const fit = useCallback(() => {
    const el = ref.current;
    // display:none (reveal's non-current sections) measures 0 — keep the last
    // scale; the IntersectionObserver below re-fits once the slide is shown.
    if (!el || el.clientHeight === 0) return;
    const chosen = pickScale((s) => {
      el.style.setProperty('--gs-font-scale', String(s));
      // Both axes: text only ever overflows downwards, but a table column or an
      // image with intrinsic dimensions overflows sideways, where the surface
      // clips it without ever growing taller — a height-only probe reports that
      // as "fits".
      return el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    }, scaleRef.current);
    // The walk may have ended on a rejected probe — apply the winner.
    el.style.setProperty('--gs-font-scale', String(chosen));
    scaleRef.current = chosen;
    setScale(chosen);
  }, []);

  const rafRef = useRef(0);
  const schedule = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(fit);
  }, [fit]);

  // Content changes: fit pre-paint so overflowing text never flashes.
  useLayoutEffect(() => {
    if (enabled) fit();
  }, [enabled, contentKey, fit]);

  // Async re-fit triggers while enabled.
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const el = ref.current;
    // Webfonts land after first paint; KaTeX faces load lazily on the first
    // formula render, after fonts.ready may already have resolved — so both.
    document.fonts?.ready.then(() => {
      if (alive) schedule();
    });
    document.fonts?.addEventListener('loadingdone', schedule);
    // <img> loads change body height; load doesn't bubble — capture phase.
    el?.addEventListener('load', schedule, true);
    window.addEventListener(SLIDE_REFIT_EVENT, fit);
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            if (entries.some((e) => e.isIntersecting)) schedule();
          })
        : null;
    if (el && io) io.observe(el);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
      document.fonts?.removeEventListener('loadingdone', schedule);
      el?.removeEventListener('load', schedule, true);
      window.removeEventListener(SLIDE_REFIT_EVENT, fit);
      io?.disconnect();
    };
  }, [enabled, schedule, fit]);

  return { ref, scale: enabled ? scale : 1 };
}

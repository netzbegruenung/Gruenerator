import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** Discrete shrink steps — coarse on purpose so re-fits don't jitter while typing. */
const SCALE_LADDER = [1, 0.9, 0.8, 0.7, 0.6, 0.5];

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
 * straight onto the node and re-measures per ladder step (≤6 reflows of one
 * slide subtree). The final setState only mirrors the chosen step into render
 * state — React bails out on equal values, so no effect→state→effect loop.
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

  const fit = useCallback(() => {
    const el = ref.current;
    // display:none (reveal's non-current sections) measures 0 — keep the last
    // scale; the IntersectionObserver below re-fits once the slide is shown.
    if (!el || el.clientHeight === 0) return;
    let chosen = 1;
    for (const s of SCALE_LADDER) {
      chosen = s;
      el.style.setProperty('--gs-font-scale', String(s));
      if (el.scrollHeight <= el.clientHeight + 1) break;
    }
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
      io?.disconnect();
    };
  }, [enabled, schedule]);

  return { ref, scale: enabled ? scale : 1 };
}

/**
 * Awaits every declared @font-face load before a stage export rasterizes.
 *
 * Brand fonts load via `font-display: swap`, so a synchronous
 * `stage.toDataURL()` fired before they finish bakes in the fallback face —
 * the intermittent "some AT sharepics render in the wrong font" bug (the
 * heavier de-AT Gotham Narrow set is the most visible offender). Gating the
 * user-facing export paths on this makes the snapshot deterministic. Cheap and
 * idempotent after the first call (faces are cached), and best-effort: an
 * export must never hang or fail on font loading.
 */
export async function ensureFontsReady(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  try {
    await Promise.all(Array.from(document.fonts, (face) => face.load().catch(() => undefined)));
    await document.fonts.ready;
  } catch {
    // best-effort — never block an export on font loading
  }
}

import * as Sentry from '@sentry/react';

const ALIVE_KEY = 'gr:tab-alive';

/**
 * A tab whose renderer the browser kills (Chrome's "Aw, Snap",
 * e.g. RESULT_CODE_KILLED_BAD_MESSAGE or an OOM) runs no more JavaScript, so
 * nothing reaches GlitchTip. This leaves a marker in sessionStorage that only
 * `pagehide` removes; when the reload from the crash page finds it still
 * there, the previous page died without unloading.
 *
 * Only a `reload` counts: duplicating a tab or restoring a session copies
 * sessionStorage too, and a tab Chrome discarded to save memory reloads with
 * `document.wasDiscarded`.
 */
export function reportKilledTab(): void {
  try {
    const previous = sessionStorage.getItem(ALIVE_KEY);
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    if (
      previous &&
      navigation?.type === 'reload' &&
      !(document as Document & { wasDiscarded?: boolean }).wasDiscarded
    ) {
      const startedAt = Number(previous);
      Sentry.captureMessage('Tab ended without unloading (renderer killed?)', {
        level: 'error',
        tags: { kind: 'tab-killed' },
        extra: {
          aliveForSeconds: Number.isFinite(startedAt)
            ? Math.round((Date.now() - startedAt) / 1000)
            : null,
        },
      });
    }

    const markAlive = () => sessionStorage.setItem(ALIVE_KEY, String(Date.now()));
    markAlive();
    window.addEventListener('pagehide', () => sessionStorage.removeItem(ALIVE_KEY));
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) markAlive();
    });
  } catch {
    // sessionStorage can be blocked; this is best-effort telemetry.
  }
}

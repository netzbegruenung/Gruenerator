import * as Sentry from '@sentry/react';

const ALIVE_KEY = 'gr:tab-alive';

interface AliveMarker {
  startedAt: number;
  hiddenAt: number | null;
}

function readMarker(raw: string): AliveMarker {
  try {
    const parsed = JSON.parse(raw) as Partial<AliveMarker> | number;
    // Markers written before the visibility field existed are a bare timestamp.
    if (typeof parsed === 'number') return { startedAt: parsed, hiddenAt: null };
    return { startedAt: Number(parsed.startedAt), hiddenAt: parsed.hiddenAt ?? null };
  } catch {
    return { startedAt: NaN, hiddenAt: null };
  }
}

function secondsSince(time: number | null): number | null {
  return time !== null && Number.isFinite(time) ? Math.round((Date.now() - time) / 1000) : null;
}

/**
 * A tab whose renderer the browser kills (Chrome's "Aw, Snap",
 * e.g. RESULT_CODE_KILLED_BAD_MESSAGE or an OOM) runs no more JavaScript, so
 * nothing reaches GlitchTip. This leaves a marker in sessionStorage that only
 * `pagehide` removes; when the reload from the crash page finds it still
 * there, the previous page died without unloading.
 *
 * Only a `reload` counts: duplicating a tab or restoring a session copies
 * sessionStorage too, and a tab Chrome discarded to save memory reloads with
 * `document.wasDiscarded`. Only the top-level document takes part: the chat's
 * artifact panel embeds the app in a same-origin iframe, which shares this
 * sessionStorage and would overwrite or remove the page's marker.
 *
 * The marker also records whether the page was hidden. iOS Safari and Firefox
 * evict background tabs under memory pressure without `pagehide` and without
 * `wasDiscarded`; such a kill is reported as `state: background`, a warning,
 * apart from a page that died in front of the user.
 */
export function reportKilledTab(): void {
  try {
    if (window.top !== window) return;

    const previous = sessionStorage.getItem(ALIVE_KEY);
    const navigation = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    if (
      previous &&
      navigation?.type === 'reload' &&
      !(document as Document & { wasDiscarded?: boolean }).wasDiscarded
    ) {
      const marker = readMarker(previous);
      const background = marker.hiddenAt !== null;
      Sentry.captureMessage('Tab ended without unloading (renderer killed?)', {
        level: background ? 'warning' : 'error',
        tags: { kind: 'tab-killed', state: background ? 'background' : 'foreground' },
        extra: {
          aliveForSeconds: secondsSince(marker.startedAt),
          hiddenForSeconds: secondsSince(marker.hiddenAt),
        },
      });
    }

    const marker: AliveMarker = { startedAt: Date.now(), hiddenAt: null };
    // Safari can fire `visibilitychange` after `pagehide`; writing then would
    // bring back the marker of a page that unloaded cleanly.
    let unloaded = false;
    const write = () => {
      if (!unloaded) sessionStorage.setItem(ALIVE_KEY, JSON.stringify(marker));
    };
    write();
    window.addEventListener('pagehide', () => {
      unloaded = true;
      sessionStorage.removeItem(ALIVE_KEY);
    });
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        unloaded = false;
        marker.startedAt = Date.now();
        marker.hiddenAt = null;
        write();
      }
    });
    document.addEventListener('visibilitychange', () => {
      marker.hiddenAt = document.visibilityState === 'hidden' ? Date.now() : null;
      write();
    });
  } catch {
    // sessionStorage can be blocked; this is best-effort telemetry.
  }
}

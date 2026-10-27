import { Loader2 } from 'lucide-react';
import { useId } from 'react';

import { ComputerUse, type ComputerStep } from './assistant-ui/elements/computer-use';

import type { BrowserSessionArtifact } from '../stores/artifactLiveStore';

/**
 * What the user watches while the browser agent (`website_erkunden`) works:
 * the screen it is looking at with the cursor trail, every step it took, and
 * the screenshots it saved.
 *
 * Rendered as React like ResearchLogView, not through the panel's sandboxed
 * iframe — this is our own content, updated per step.
 *
 * The cursor graphic is decorative (`aria-hidden` in the element). The step
 * list below is what carries the run for a screen reader, which is why it
 * lists EVERY step — also the ones without a click position, which the trail
 * cannot plot.
 */
export function BrowserSessionView({ artifact }: { artifact: BrowserSessionArtifact }) {
  const { steps, screenshots, status, summary, startUrl } = artifact;
  const stepsHeadingId = useId();
  const screenshotsHeadingId = useId();

  const latest = steps.at(-1) ?? null;
  const latestScreen = [...steps].reverse().find((s) => s.imageUrl !== '') ?? null;
  const plotted: ComputerStep[] = steps.flatMap((s) =>
    s.xPct !== null && s.yPct !== null
      ? [{ id: String(s.n), action: s.action, target: s.target ?? '', x: s.xPct, y: s.yPct }]
      : []
  );

  return (
    <div className="h-full overflow-y-auto px-4 py-3 text-foreground">
      <ComputerUse
        url={latest?.url ?? startUrl}
        steps={plotted}
        activeIndex={plotted.length - 1}
        className="max-w-none"
      >
        {latestScreen ? (
          <img
            src={latestScreen.imageUrl}
            alt={`Bildschirm: ${latestScreen.title}`}
            className="block h-auto w-full"
          />
        ) : (
          <p className="flex min-h-[8.5rem] items-center justify-center text-sm text-foreground-muted">
            Browser startet …
          </p>
        )}
      </ComputerUse>

      <div role="status" className="mt-3 text-sm">
        {status === 'running' && steps.length > 0 && (
          <p className="flex items-center gap-2 text-foreground-muted">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
            Der Browser-Agent arbeitet …
          </p>
        )}
        {/* Abbruch und Fehler kommen beide als `failed`; die Zusammenfassung sagt welcher. */}
        {status === 'failed' && <p className="font-medium text-foreground">Nicht abgeschlossen</p>}
        {status !== 'running' && summary && <p className="text-foreground">{summary}</p>}
      </div>

      {steps.length > 0 && (
        <section className="mt-4">
          <h3
            id={stepsHeadingId}
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted"
          >
            Schritte
          </h3>
          <ol aria-labelledby={stepsHeadingId} className="space-y-1.5">
            {steps.map((s) => (
              <li key={s.n} className="flex items-baseline gap-2 text-sm">
                <span className="shrink-0 font-mono text-xs text-foreground-muted tabular-nums">
                  {s.n}.
                </span>
                <span className="shrink-0 font-mono text-xs text-foreground-muted">{s.action}</span>
                {s.target && <span className="min-w-0 break-words">{s.target}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {screenshots.length > 0 && (
        <section className="mt-5">
          <h3
            id={screenshotsHeadingId}
            className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted"
          >
            Screenshots
          </h3>
          <ul aria-labelledby={screenshotsHeadingId} className="grid grid-cols-2 gap-2">
            {screenshots.map((shot) => (
              <li key={shot.name}>
                <a
                  href={shot.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block overflow-hidden rounded-lg border border-border hover:border-primary"
                >
                  <img src={shot.url} alt="" className="block aspect-video w-full object-cover" />
                  <span className="block truncate px-2 py-1 text-xs text-foreground">
                    {shot.name}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

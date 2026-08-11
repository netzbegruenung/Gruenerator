import { Check, CircleDashed, FileText, Loader2, X } from 'lucide-react';

import type { ResearchLogArtifact, ResearchLogStep } from '../stores/artifactLiveStore';

/**
 * What the user watches while the research agent works.
 *
 * Deliberately rendered as React rather than through the panel's sandboxed
 * `srcDoc` iframe: this is our own trusted content that updates every few
 * seconds, and re-serialising a whole HTML document per update to cross an
 * iframe boundary would be both wasteful and unstyleable.
 *
 * Two lists, because they answer different questions. The plan says how far
 * along the run is; the activity log says what it is doing right now — a run
 * that spends ninety seconds on one sub-question looks stuck without it.
 */

function StepIcon({ status }: { status: ResearchLogStep['status'] }) {
  if (status === 'done') {
    return <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />;
  }
  if (status === 'failed') {
    return <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden />;
  }
  return (
    <Loader2
      className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-foreground-muted"
      aria-hidden
    />
  );
}

function statusLabel(status: ResearchLogStep['status']): string {
  if (status === 'done') return 'abgeschlossen';
  if (status === 'failed') return 'fehlgeschlagen';
  return 'läuft';
}

export function ResearchLogView({ artifact }: { artifact: ResearchLogArtifact }) {
  const { plan, steps, status, documentUrl } = artifact;
  const donePlanSteps = plan.filter((s) => s.status === 'done').length;

  return (
    <div className="h-full overflow-y-auto px-4 py-3 text-foreground">
      {status === 'running' && (
        <p className="mb-4 flex items-center gap-2 text-sm text-foreground-muted">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Die Recherche läuft — das dauert einige Minuten.
        </p>
      )}

      {status === 'failed' && (
        <p className="mb-4 text-sm text-foreground-muted">
          Die Recherche konnte nicht abgeschlossen werden.
        </p>
      )}

      {documentUrl && (
        <a
          href={documentUrl}
          className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5"
        >
          <FileText className="h-4 w-4" aria-hidden />
          Bericht öffnen
        </a>
      )}

      {plan.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Plan ({donePlanSteps}/{plan.length})
          </h3>
          <ol className="space-y-1.5">
            {plan.map((step) => (
              <li key={step.id} className="flex items-start gap-2 text-sm">
                {step.status === 'done' ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                ) : (
                  <CircleDashed
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground-muted"
                    aria-hidden
                  />
                )}
                <span className={step.status === 'done' ? 'text-foreground-muted' : ''}>
                  {step.label}
                  <span className="sr-only"> — {statusLabel(step.status)}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {steps.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
            Schritte
          </h3>
          {/* aria-live so the running commentary reaches screen readers without
              them having to poll the panel; polite, because it updates often. */}
          <ul className="space-y-1.5" aria-live="polite">
            {steps.map((step) => (
              <li key={step.id} className="flex items-start gap-2 text-sm">
                <StepIcon status={step.status} />
                <span
                  className={
                    step.status === 'running' ? 'text-foreground' : 'text-foreground-muted'
                  }
                >
                  {step.label}
                  <span className="sr-only"> — {statusLabel(step.status)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.length === 0 && steps.length === 0 && status === 'running' && (
        <p className="text-sm text-foreground-muted">Der Agent plant die Recherche…</p>
      )}
    </div>
  );
}

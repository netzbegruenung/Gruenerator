import { type SiteGenerationStep } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';

import { SITE_GENERATION_STEP_LABELS } from '../../generation/stepLabels';

import { useGenerationFocus } from './useGenerationFocus';

interface GenerationProgressProps {
  message: string;
  steps: readonly SiteGenerationStep[];
  current: SiteGenerationStep | null;
  onCancel?: () => void;
}

/**
 * The running generation as a card on top of the editor skeleton: the page the person is about to
 * edit already takes shape behind it. Takes the focus while it runs and hands it back afterwards.
 */
export function GenerationProgress({ message, steps, current, onCancel }: GenerationProgressProps) {
  const cardRef = useGenerationFocus<HTMLElement>(onCancel);

  const currentIndex = current ? steps.indexOf(current) : -1;
  // The running step counts as half done, so the bar is never empty while work is under way.
  const progress = currentIndex >= 0 ? currentIndex + 0.5 : 0;
  const percent = steps.length > 0 ? Math.round((100 * progress) / steps.length) : 0;
  const currentLabel = current ? SITE_GENERATION_STEP_LABELS[current] : '';

  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby="generation-progress-title"
      className="w-[min(400px,calc(100vw-2rem))] rounded-xl bg-background-pure p-6 text-center shadow-[0_10px_40px_rgba(0,0,0,0.2)] outline-none"
    >
      <h2 id="generation-progress-title" className="text-lg font-medium text-foreground mb-2">
        {message}
      </h2>
      <p role="status" className="sr-only">
        {currentLabel}
      </p>
      {steps.length > 0 && (
        <>
          <ol className="mt-4 mb-4 list-none p-0 text-left text-sm">
            {steps.map((step, index) => {
              const done = currentIndex > index;
              const active = step === current;
              return (
                <li
                  key={step}
                  aria-current={active ? 'step' : undefined}
                  className={
                    active
                      ? 'py-1 font-semibold text-foreground'
                      : 'py-1 text-grey-600 dark:text-grey-400'
                  }
                >
                  {SITE_GENERATION_STEP_LABELS[step]}
                  {done && <span className="sr-only"> erledigt</span>}
                  {done && <span aria-hidden="true"> ✓</span>}
                </li>
              );
            })}
          </ol>
          <div
            role="progressbar"
            aria-label="Fortschritt"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-2 w-full rounded bg-grey-100 dark:bg-grey-800 overflow-hidden"
          >
            <div
              className="h-full bg-primary-950 dark:bg-primary-500 rounded transition-[width] duration-300 ease-out motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      )}
      {onCancel && (
        <Button variant="secondary" className="mt-6" onClick={onCancel}>
          Abbrechen
        </Button>
      )}
    </section>
  );
}

import { type SiteGenerationStep } from '@gruenerator/contracts';
import { Button } from '@gruenerator/ui';

import { SITE_GENERATION_STEP_LABELS } from '../../generation/stepLabels';

interface LoadingOverlayProps {
  isLoading: boolean;
  message: string;
  steps: readonly SiteGenerationStep[];
  current: SiteGenerationStep | null;
  onCancel?: () => void;
}

export function LoadingOverlay({
  isLoading,
  message,
  steps,
  current,
  onCancel,
}: LoadingOverlayProps) {
  if (!isLoading) return null;

  const currentIndex = current ? steps.indexOf(current) : -1;
  const finished = Math.max(currentIndex, 0);
  const percent = steps.length > 0 ? Math.round((100 * finished) / steps.length) : 0;
  const currentLabel = current ? SITE_GENERATION_STEP_LABELS[current] : '';

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] animate-[fade-in_0.2s_ease-out] motion-reduce:animate-none"
      role="dialog"
      aria-modal="true"
      aria-label={message}
    >
      <div className="bg-background-pure rounded-xl p-8 shadow-[0_10px_40px_rgba(0,0,0,0.2)] max-w-[400px] w-[90%] text-center">
        <div
          className="w-[60px] h-[60px] mx-auto mb-6 border-4 border-grey-100 dark:border-grey-800 border-t-primary-950 rounded-full animate-[spin_0.8s_linear_infinite] motion-reduce:animate-none"
          aria-hidden="true"
        />
        <p className="text-lg font-medium text-foreground mb-2">{message}</p>
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
                className="h-full bg-primary-950 rounded transition-[width] duration-300 ease-out motion-reduce:transition-none"
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
      </div>
    </div>
  );
}

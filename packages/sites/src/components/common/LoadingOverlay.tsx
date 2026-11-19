import { type SiteGenerationStep } from '@gruenerator/contracts';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@gruenerator/ui';
import { useRef } from 'react';

import { SITE_GENERATION_STEP_LABELS } from '../../generation/stepLabels';

interface LoadingOverlayProps {
  isLoading: boolean;
  message: string;
  steps: readonly SiteGenerationStep[];
  current: SiteGenerationStep | null;
  onCancel?: () => void;
}

function OverlayDialog({
  message,
  steps,
  current,
  onCancel,
}: Omit<LoadingOverlayProps, 'isLoading'>) {
  const returnFocusTo = useRef<Element | null>(document.activeElement);

  const currentIndex = current ? steps.indexOf(current) : -1;
  // The running step counts as half done, so the bar is never empty while work is under way.
  const progress = currentIndex >= 0 ? currentIndex + 0.5 : 0;
  const percent = steps.length > 0 ? Math.round((100 * progress) / steps.length) : 0;
  const currentLabel = current ? SITE_GENERATION_STEP_LABELS[current] : '';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel?.();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (returnFocusTo.current instanceof HTMLElement) returnFocusTo.current.focus();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (!onCancel) event.preventDefault();
        }}
        className="bg-background-pure rounded-xl p-8 shadow-[0_10px_40px_rgba(0,0,0,0.2)] max-w-[400px] w-[90%] block text-center motion-reduce:animate-none motion-reduce:duration-0"
      >
        <DialogDescription className="sr-only">
          Bitte warten, die Seite wird erstellt.
        </DialogDescription>
        <div
          className="w-[60px] h-[60px] mx-auto mb-6 border-4 border-grey-100 dark:border-grey-800 border-t-primary-950 rounded-full animate-[spin_0.8s_linear_infinite] motion-reduce:animate-none"
          aria-hidden="true"
        />
        <DialogTitle className="text-lg font-medium text-foreground mb-2">{message}</DialogTitle>
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
      </DialogContent>
    </Dialog>
  );
}

export function LoadingOverlay({ isLoading, ...rest }: LoadingOverlayProps) {
  if (!isLoading) return null;
  return <OverlayDialog {...rest} />;
}

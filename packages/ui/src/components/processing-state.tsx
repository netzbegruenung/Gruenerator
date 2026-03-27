import type { ReactNode } from 'react';

import { AnimatedCircularProgressBar } from './animated-circular-progress-bar';
import { StepBreadcrumb, type StepBreadcrumbStep } from './step-breadcrumb';

export interface ProcessingStateProps {
  progress: number;
  label: string;
  steps?: StepBreadcrumbStep[];
  activeStepIndex?: number;
  footer?: ReactNode;
  className?: string;
}

export function ProcessingState({
  progress,
  label,
  steps,
  activeStepIndex,
  footer,
  className,
}: ProcessingStateProps) {
  return (
    <div className={className ?? 'flex flex-col items-center gap-lg py-xl'}>
      <AnimatedCircularProgressBar
        value={progress}
        min={0}
        max={100}
        gaugePrimaryColor="var(--primary-600)"
        gaugeSecondaryColor="var(--grey-200)"
        className="size-32"
      />
      <div className="flex flex-col items-center gap-xs">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {steps && steps.length > 0 && (
          <StepBreadcrumb steps={steps} activeIndex={activeStepIndex ?? 0} />
        )}
      </div>
      {footer}
    </div>
  );
}

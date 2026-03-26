import { cn } from '../lib/cn';

export interface StepBreadcrumbStep {
  label: string;
  suffix?: string;
}

export interface StepBreadcrumbProps {
  steps: StepBreadcrumbStep[];
  activeIndex: number;
  className?: string;
}

export function StepBreadcrumb({ steps, activeIndex, className }: StepBreadcrumbProps) {
  return (
    <div
      className={cn('flex items-center gap-sm text-xs text-grey-400 dark:text-grey-500', className)}
    >
      {steps.map((step, i) => (
        <span key={step.label} className="contents">
          {i > 0 && <span>→</span>}
          <span
            className={cn(
              i < activeIndex && 'text-primary-600',
              i === activeIndex && 'text-primary-600 font-semibold'
            )}
          >
            {step.label}
            {step.suffix && i === activeIndex && ` ${step.suffix}`}
          </span>
        </span>
      ))}
    </div>
  );
}

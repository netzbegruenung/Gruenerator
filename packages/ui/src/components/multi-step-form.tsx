import { Children, type ReactElement, type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';

import { cn } from '../lib/cn';

interface StepProps {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}

function Step({ children }: StepProps) {
  return <>{children}</>;
}

interface MultiStepFormProps {
  currentStep: number;
  onBack?: () => void;
  children: ReactNode;
  className?: string;
}

function MultiStepForm({ currentStep, onBack, children, className }: MultiStepFormProps) {
  const steps = Children.toArray(children).filter(
    (child): child is ReactElement<StepProps> => (child as ReactElement).type === Step
  );

  const totalSteps = steps.length;
  const activeStep = steps[currentStep];
  const stepProps = activeStep?.props as StepProps | undefined;

  return (
    <div className={cn('flex flex-col gap-lg', className)}>
      {/* Header with back + title */}
      <div className="flex items-center gap-sm">
        {currentStep > 0 && onBack && (
          <button
            type="button"
            onClick={onBack}
            className="rounded-md p-1 text-grey-500 hover:text-foreground hover:bg-background-alt transition-colors"
          >
            <ArrowLeft className="size-4" />
          </button>
        )}
        <div>
          {stepProps?.title && (
            <h2 className="text-sm font-medium text-foreground">{stepProps.title}</h2>
          )}
          {stepProps?.subtitle && (
            <p className="text-xs text-grey-500 mt-0.5">{stepProps.subtitle}</p>
          )}
        </div>
      </div>

      {/* Active step content */}
      <div>{activeStep}</div>

      {/* Step dots */}
      {totalSteps > 1 && (
        <div className="flex justify-center gap-1.5">
          {steps.map((_, i) => (
            <div
              key={i}
              className={cn(
                'size-1.5 rounded-full transition-colors',
                i === currentStep ? 'bg-primary-500' : 'bg-grey-300 dark:bg-grey-600'
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

MultiStepForm.Step = Step;

export { MultiStepForm, type MultiStepFormProps, type StepProps };

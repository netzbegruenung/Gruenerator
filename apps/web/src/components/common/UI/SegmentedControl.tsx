import { type JSX, useCallback } from 'react';

import { cn } from '../../../utils/cn';

// Define step interface
interface SegmentedStep {
  value: string | number;
  label: string;
  disabled?: boolean;
}

// Define the SegmentedControl component
interface SegmentedControlProps {
  steps: SegmentedStep[];
  currentValue?: string | number;
  onChange: (value: string | number) => void;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
}

const SegmentedControl = ({
  steps = [],
  currentValue,
  onChange,
  disabled = false,
  label,
  ariaLabel = 'Select option',
}: SegmentedControlProps): JSX.Element => {
  // Handle button click
  const handleClick = useCallback(
    (value: string | number, stepDisabled?: boolean) => {
      // Only call onChange if the specific step is not disabled,
      // the whole control is not disabled, and the value actually changes
      if (!stepDisabled && !disabled && value !== currentValue) {
        onChange(value);
      }
    },
    [onChange, disabled, currentValue]
  );

  return (
    <div
      className={cn(
        'flex flex-row items-center gap-md border border-[var(--border-subtle,#ddd)] rounded-lg p-sm bg-background w-full box-border',
        disabled && 'opacity-70'
      )}
    >
      {label && (
        <span className="text-[0.85rem] font-medium text-foreground whitespace-nowrap shrink-0">
          {label}
        </span>
      )}
      <div
        className={cn(
          'inline-flex rounded-md overflow-hidden grow box-border border border-[var(--border-subtle,#ccc)]',
          disabled && 'opacity-70'
        )}
        role="group"
        aria-label={ariaLabel}
      >
        {steps.map((step, index) => {
          const isActive = step.value === currentValue;
          const isDisabled = step.disabled || disabled;
          const isLast = index === steps.length - 1;
          return (
            <button
              key={step.value}
              type="button"
              className={cn(
                'grow basis-0 py-2.5 px-4 border-none bg-background text-foreground text-[0.9rem] cursor-pointer text-center whitespace-nowrap transition-all duration-200',
                !isLast && 'border-r border-r-[var(--border-subtle,#ccc)]',
                !isActive && !isDisabled && 'hover:bg-background-alt',
                isActive && 'bg-[var(--primary,#4CAF50)] text-white font-medium shadow-[inset_0_1px_3px_rgba(0,0,0,0.1)]',
                isDisabled && 'cursor-not-allowed',
                'focus-visible:outline-2 focus-visible:outline-[var(--himmel,#0BA1DD)] focus-visible:outline-offset-[-1px] focus-visible:z-[1] focus-visible:relative'
              )}
              onClick={() => handleClick(step.value, step.disabled)}
              disabled={isDisabled}
              aria-pressed={isActive}
            >
              {step.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SegmentedControl;

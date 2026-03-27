import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../lib/cn';

const progressBarVariants = cva(
  'w-full overflow-hidden rounded-full bg-grey-100 dark:bg-grey-800',
  {
    variants: {
      size: {
        sm: 'h-1.5',
        md: 'h-2',
        lg: 'h-4',
      },
    },
    defaultVariants: {
      size: 'sm',
    },
  }
);

interface ProgressBarProps extends VariantProps<typeof progressBarVariants> {
  value: number;
  color?: string;
  className?: string;
}

function ProgressBar({ value, color, size, className }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <div className={cn(progressBarVariants({ size }), className)}>
      <div
        className="h-full rounded-full transition-all"
        style={{
          width: `${clamped}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

export { ProgressBar, progressBarVariants, type ProgressBarProps };

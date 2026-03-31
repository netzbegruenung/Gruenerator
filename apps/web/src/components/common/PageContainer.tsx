import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

const MAX_WIDTH = {
  sm: 'max-w-[800px]',
  md: 'max-w-[900px]',
  lg: 'max-w-[1200px]',
} as const;

interface PageContainerProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  maxWidth?: keyof typeof MAX_WIDTH;
  gradient?: boolean;
  noPadTop?: boolean;
  className?: string;
}

export default function PageContainer({
  children,
  title,
  subtitle,
  maxWidth = 'lg',
  gradient = true,
  noPadTop = false,
  className,
}: PageContainerProps) {
  return (
    <div
      className={cn(
        'min-h-screen',
        gradient && 'bg-gradient-to-b from-background to-secondary-600/5 dark:to-background'
      )}
    >
      <div
        className={cn(
          'w-full mx-auto px-lg pb-xl max-md:px-md',
          noPadTop ? 'pt-8 max-md:pt-sm' : 'pt-[60px] max-md:pt-lg',
          MAX_WIDTH[maxWidth],
          className
        )}
      >
        {title && (
          <div className="text-center mb-xl">
            <h1 className="text-4xl max-md:text-2xl font-semibold text-foreground-heading mb-sm">
              {title}
            </h1>
            {subtitle && (
              <p className="text-lg text-foreground max-w-[800px] mx-auto">{subtitle}</p>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

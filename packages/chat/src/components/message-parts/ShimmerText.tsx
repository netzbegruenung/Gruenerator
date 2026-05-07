import { type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface ShimmerTextProps {
  children: ReactNode;
  className?: string;
}

export function ShimmerText({ children, className }: ShimmerTextProps) {
  return <span className={cn('shimmer-text', className)}>{children}</span>;
}

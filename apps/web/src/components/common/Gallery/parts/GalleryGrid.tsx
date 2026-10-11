import type { JSX, ReactNode } from 'react';

import { cn } from '@/utils/cn';

export type GridSize = 'small' | 'large';

const GRID_CLASS: Record<GridSize, string> = {
  small:
    'grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-5 max-md:grid-cols-[repeat(auto-fill,minmax(165px,1fr))] max-md:gap-3',
  large:
    'grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] gap-6 max-md:grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))] max-md:gap-4',
};

export function GalleryGrid({
  size,
  className,
  children,
}: {
  size: GridSize;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return <div className={cn(GRID_CLASS[size], className)}>{children}</div>;
}

/** Placeholder tiles while the first page loads; keyed by index, so they never reorder. */
export function GallerySkeleton({
  count = 12,
  className = 'aspect-[3/4]',
}: {
  count?: number;
  className?: string;
}): JSX.Element {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          aria-hidden
          className={cn('animate-pulse rounded-lg bg-background-alt', className)}
        />
      ))}
    </>
  );
}

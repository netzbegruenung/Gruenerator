import type { JSX, ReactNode } from 'react';

export function GalleryEmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="py-16 text-center">
      <p className="mb-1 text-[1.0625rem] font-semibold text-foreground-heading">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-sm flex justify-center">{action}</div>}
    </div>
  );
}

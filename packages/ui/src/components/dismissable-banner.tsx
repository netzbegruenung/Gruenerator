import { type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';

import { usePersistentDismiss } from '../hooks/use-persistent-dismiss';
import { cn } from '../lib/cn';
import { statusBannerVariants } from './status-banner';

interface DismissableBannerProps
  extends React.ComponentProps<'div'>, VariantProps<typeof statusBannerVariants> {
  storageKey: string;
}

function DismissableBanner({
  storageKey,
  variant,
  className,
  children,
  ...props
}: DismissableBannerProps) {
  const { isDismissed, dismiss } = usePersistentDismiss(storageKey);

  if (isDismissed) return null;

  return (
    <div
      data-slot="dismissable-banner"
      role="status"
      className={cn(statusBannerVariants({ variant }), 'relative pr-10', className)}
      {...props}
    >
      {children}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Schließen"
        className="absolute right-2 top-2 rounded p-1 opacity-70 transition-opacity hover:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

export { DismissableBanner, type DismissableBannerProps };

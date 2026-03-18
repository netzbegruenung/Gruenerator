import { cn } from '../lib/cn';
import { Spinner } from './spinner';

function LoadingSection({
  className,
  label = 'Laden...',
  ...props
}: React.ComponentProps<'div'> & { label?: string }) {
  return (
    <div
      data-slot="loading-section"
      className={cn('flex items-center gap-sm py-md', className)}
      {...props}
    >
      <Spinner className="size-4" />
      <span className="text-sm text-foreground">{label}</span>
    </div>
  );
}

export { LoadingSection };

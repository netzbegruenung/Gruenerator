import { cn } from '../../utils/cn';

export type SpinnerSize = 'small' | 'medium' | 'large';

export interface SpinnerProps {
  size?: SpinnerSize;
  white?: boolean;
  withBackground?: boolean;
  className?: string;
}

const sizeStyles: Record<SpinnerSize, string> = {
  small: 'h-4 w-4 border-2',
  medium: 'h-[30px] w-[30px] border-[3px]',
  large: 'h-10 w-10 border-4',
};

const Spinner = ({
  size = 'medium',
  white = false,
  withBackground = false,
  className = '',
}: SpinnerProps) => {
  const spinner = (
    <div
      className={cn(
        'shrink-0 rounded-full animate-spin',
        'border-black/10 border-t-[var(--font-color-h,#005538)]',
        'dark:border-white/10 dark:border-t-[var(--font-color-h,#005538)]',
        sizeStyles[size],
        white && 'border-white/30 border-t-white dark:border-white/30 dark:border-t-white',
        className
      )}
      aria-label="Wird geladen..."
      role="status"
    />
  );

  if (withBackground) {
    return (
      <div className="flex items-center justify-center bg-[var(--klee,#46a758)] rounded-lg w-9 h-9 p-0 m-0">
        {spinner}
      </div>
    );
  }

  return spinner;
};

export default Spinner;

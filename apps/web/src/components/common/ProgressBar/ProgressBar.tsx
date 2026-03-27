import { cn } from '../../../utils/cn';

interface ProgressBarProps {
  progress: number;
  showPercentage?: boolean;
  className?: string;
  fixed?: boolean;
  ariaLabel?: string;
}

const ProgressBar = ({
  progress,
  showPercentage = false,
  className = '',
  fixed = false,
  ariaLabel = 'Progress',
}: ProgressBarProps) => {
  return (
    <div
      className={cn(
        'w-full flex flex-col items-center gap-xs m-0 p-0',
        fixed && 'fixed bottom-0 left-0 right-0 z-[1000] pointer-events-none',
        className
      )}
    >
      <div
        className={cn(
          'w-full h-1.5 bg-transparent rounded-r-[3px] overflow-visible relative m-0 p-0',
          'max-md:h-1'
        )}
        role="progressbar"
        aria-label={ariaLabel}
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            'h-full bg-primary-600 transition-[width] duration-400 ease-in-out rounded-r-[3px] relative',
            'shadow-[0_-2px_8px_var(--primary),0_-4px_16px_var(--primary),0_-6px_24px_rgba(0,85,56,0.4),inset_0_0_4px_rgba(255,255,255,0.3)]',
            'animate-[lightsaber-glow_3s_ease-in-out_infinite]',
            'max-md:rounded-r-[2px] max-md:shadow-[0_-2px_6px_var(--primary),0_-4px_12px_var(--primary),0_-6px_18px_rgba(0,85,56,0.3)]'
          )}
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
      {showPercentage && (
        <div className="text-sm text-foreground font-semibold text-center max-md:text-[11px]">
          {Math.round(progress)}%
        </div>
      )}
    </div>
  );
};

export default ProgressBar;

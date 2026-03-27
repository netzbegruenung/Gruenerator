import { HiBeaker } from 'react-icons/hi';

import { cn } from '../../../utils/cn';
import { StatusBadge } from '../StatusBadge';

interface EarlyAccessBannerProps {
  feedbackUrl?: string;
  description?: string;
}

const EarlyAccessBanner = ({
  feedbackUrl,
  description = 'Diese Funktion befindet sich noch in der Testphase. Es kann zu Fehlern kommen.',
}: EarlyAccessBannerProps) => {
  return (
    <div
      className={cn(
        'flex items-center gap-md p-md px-lg',
        'bg-background border border-grey-200 dark:border-grey-700 rounded-lg mb-lg',
        'max-md:flex-col max-md:text-center max-md:gap-sm'
      )}
    >
      <HiBeaker className="text-2xl text-[var(--link-color)] shrink-0" />
      <div
        className={cn(
          'flex-1 flex items-center gap-md',
          'max-md:flex-col max-md:gap-sm'
        )}
      >
        <p
          className={cn(
            'font-semibold text-sm text-foreground m-0',
            'flex items-center gap-sm shrink-0',
            'max-md:justify-center'
          )}
        >
          <StatusBadge type="early-access" variant="inline" />
        </p>
        <p className="text-xs text-foreground m-0">{description}</p>
      </div>
      {feedbackUrl && (
        <a
          href={feedbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'shrink-0 py-sm px-md bg-[var(--klee)] text-white',
            'rounded-[var(--button-border-radius)] text-xs font-semibold no-underline',
            'transition-[background,transform] duration-200 ease-in-out',
            'hover:bg-primary-700 hover:-translate-y-px',
            'max-md:w-full max-md:text-center'
          )}
        >
          Feedback geben
        </a>
      )}
    </div>
  );
};

export default EarlyAccessBanner;

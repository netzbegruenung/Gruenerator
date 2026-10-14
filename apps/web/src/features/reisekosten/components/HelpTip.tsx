import { REISEKOSTEN_HILFE, type HilfeKey } from '@gruenerator/shared/reisekosten';
import { Popover, PopoverContent, PopoverTrigger } from '@gruenerator/ui';
import { PiQuestion } from 'react-icons/pi';

/**
 * The "?" next to a field: opens the NRW rule behind it. A popover rather than
 * a hover tooltip, so it works by click, keyboard and touch alike.
 */
export function HelpTip({ thema }: { thema: HilfeKey }) {
  const hilfe = REISEKOSTEN_HILFE[thema];
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={`Erklärung: ${hilfe.titel}`}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-grey-500 transition-colors hover:bg-primary-50 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 dark:hover:bg-primary-950 dark:hover:text-primary-200"
      >
        <PiQuestion aria-hidden className="size-4" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-sm leading-relaxed">
        <p className="mb-xs font-semibold text-foreground-heading">{hilfe.titel}</p>
        <p className="text-foreground">{hilfe.text}</p>
      </PopoverContent>
    </Popover>
  );
}

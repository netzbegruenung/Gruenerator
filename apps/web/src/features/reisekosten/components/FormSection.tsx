import { type HilfeKey } from '@gruenerator/shared/reisekosten';
import { useId, type ReactNode } from 'react';

import { HelpTip } from './HelpTip';

/** One numbered block of the paper form ("1. Fahrtkosten"), with its total on the right. */
export function FormSection({
  id,
  titel,
  hilfe,
  summe,
  children,
}: {
  id: string;
  titel: string;
  hilfe?: HilfeKey;
  summe?: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="flex scroll-mt-24 flex-col gap-4 rounded-[18px] bg-background-pure px-[clamp(1rem,3vw,1.75rem)] py-[26px] shadow-[0_0_0_1px_rgba(20,40,30,.05),0_2px_12px_rgba(20,40,30,.05)] dark:shadow-[0_0_0_1px_var(--color-grey-700)]"
    >
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex items-center gap-xs">
          <h2 id={headingId} className="m-0 text-[19px] font-bold text-foreground-heading">
            {titel}
          </h2>
          {hilfe && <HelpTip thema={hilfe} />}
        </div>
        {summe !== undefined && (
          <span className="font-[Raleway,sans-serif] text-lg font-bold tabular-nums text-foreground-heading">
            {summe}
          </span>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * A form line: label (and "?") on the left, controls on the right, stacked on
 * narrow screens. `htmlFor` names the first control so the label is clickable.
 */
export function FormRow({
  label,
  htmlFor,
  hilfe,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hilfe?: HilfeKey;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-5 gap-y-2">
      <div className="flex shrink-0 grow-0 basis-[190px] items-center gap-xs sm:pt-[11px]">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-[15px] text-foreground">
            {label}
          </label>
        ) : (
          <span className="text-[15px] text-foreground">{label}</span>
        )}
        {hilfe && <HelpTip thema={hilfe} />}
      </div>
      <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
        {children}
        {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

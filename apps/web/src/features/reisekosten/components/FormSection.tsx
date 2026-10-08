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
      className="scroll-mt-24 rounded-[14px] border border-grey-200 bg-background-pure dark:border-grey-700"
    >
      <header className="flex items-center justify-between gap-md border-b border-grey-200 px-lg py-sm dark:border-grey-700">
        <div className="flex items-center gap-xs">
          <h2 id={headingId} className="m-0 text-base font-semibold text-foreground-heading">
            {titel}
          </h2>
          {hilfe && <HelpTip thema={hilfe} />}
        </div>
        {summe !== undefined && (
          <span className="text-base font-semibold tabular-nums text-foreground-heading">
            {summe}
          </span>
        )}
      </header>
      <div className="flex flex-col divide-y divide-grey-100 dark:divide-grey-800">{children}</div>
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
    <div className="grid gap-xs px-lg py-sm sm:grid-cols-[14rem_1fr] sm:items-start sm:gap-md">
      <div className="flex items-center gap-xs pt-xs">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
            {label}
          </label>
        ) : (
          <span className="text-sm font-medium text-foreground">{label}</span>
        )}
        {hilfe && <HelpTip thema={hilfe} />}
      </div>
      <div className="flex min-w-0 flex-col gap-xs">
        {children}
        {hint && <span className="text-xs text-grey-600 dark:text-grey-400">{hint}</span>}
      </div>
    </div>
  );
}

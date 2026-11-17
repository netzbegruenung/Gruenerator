import { type ReactNode, useId } from 'react';

interface SettingsSectionProps {
  title: string;
  description?: ReactNode;
  /** Right side of the heading line, e.g. a count or a button. */
  aside?: ReactNode;
  children: ReactNode;
}

// One heading, an optional description and the rows underneath, separated by
// hairlines. Sections replace the old cards.
const SettingsSection = ({ title, description, aside, children }: SettingsSectionProps) => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col">
      <div className="flex items-baseline gap-sm pb-1">
        <h3
          id={headingId}
          className="m-0 font-[Raleway] text-[15px] font-semibold text-foreground-heading"
        >
          {title}
        </h3>
        {aside && <div className="ml-auto flex items-center gap-xs">{aside}</div>}
      </div>
      {description && (
        <p className="m-0 mb-1.5 mt-0.5 max-w-[64ch] text-[13px] text-grey-600 dark:text-grey-400">
          {description}
        </p>
      )}
      <div className="divide-y divide-grey-200 dark:divide-grey-800">{children}</div>
    </section>
  );
};

export default SettingsSection;

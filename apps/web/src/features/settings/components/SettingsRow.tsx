import { type ReactNode } from 'react';

import { getSettingsEntry } from '../settingsCatalog';

interface SettingsRowProps {
  /** Catalog id, e.g. "allgemein.aussehen" — supplies title and description. */
  id: string;
  children: ReactNode;
}

// Label + description on the left, control on the right. Borderless — parents
// separate consecutive rows with a subtle divider (divide-y), not cards.
// The wording comes from settingsCatalog.ts so the settings surface stays
// enumerable (consistent labels, and the docs can embed the real list).
const SettingsRow = ({ id, children }: SettingsRowProps) => {
  const { title, description } = getSettingsEntry(id);
  return (
    <div
      data-settings-id={id}
      className="flex min-h-14 scroll-mt-4 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3.5"
    >
      <div className="min-w-0 flex-1 basis-44">
        <p className="m-0 text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="m-0 mt-0.5 text-xs text-grey-500 dark:text-grey-400">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
};

export default SettingsRow;

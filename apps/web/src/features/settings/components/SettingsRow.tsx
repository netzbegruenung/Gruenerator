import { type ReactNode } from 'react';

interface SettingsRowProps {
  title: string;
  description?: string;
  children: ReactNode;
}

// Label + description on the left, control on the right — the standard row
// shape for settings tabs.
const SettingsRow = ({ title, description, children }: SettingsRowProps) => (
  <div className="flex items-center justify-between gap-md rounded-lg border border-grey-200 p-md dark:border-grey-700">
    <div className="min-w-0">
      <p className="m-0 text-sm font-medium text-foreground">{title}</p>
      {description && <p className="m-0 text-xs text-grey-500 dark:text-grey-400">{description}</p>}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

export default SettingsRow;

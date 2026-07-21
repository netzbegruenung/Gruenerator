import { type ReactNode } from 'react';

interface SettingsRowProps {
  title: string;
  description?: string;
  children: ReactNode;
}

// Label + description on the left, control on the right. Borderless — parents
// separate consecutive rows with a subtle divider (divide-y), not cards.
const SettingsRow = ({ title, description, children }: SettingsRowProps) => (
  <div className="flex items-center justify-between gap-md py-4">
    <div className="min-w-0">
      <p className="m-0 text-sm font-medium text-foreground">{title}</p>
      {description && (
        <p className="m-0 mt-0.5 text-xs text-grey-500 dark:text-grey-400">{description}</p>
      )}
    </div>
    <div className="shrink-0">{children}</div>
  </div>
);

export default SettingsRow;

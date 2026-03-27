import { Switch, cn } from '@gruenerator/ui';

import type { JSX } from 'react';

interface RequiredFieldToggleProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  showLabel?: boolean;
}

const RequiredFieldToggle = ({
  checked = false,
  onChange,
  disabled = false,
  label = 'Pflichtfeld',
  showLabel = true,
}: RequiredFieldToggleProps): JSX.Element => {
  const handleToggle = (newChecked: boolean): void => {
    if (!disabled && onChange) {
      onChange(newChecked);
    }
  };

  return (
    <div
      className={cn(
        'inline-flex items-center gap-xs py-xxs',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <Switch
        size="sm"
        className="data-[state=checked]:bg-secondary-600"
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={disabled}
        aria-label={label}
      />
      {showLabel && (
        <span
          className={cn(
            'text-[0.85rem] text-foreground font-medium select-none whitespace-nowrap',
            disabled && 'text-disabled'
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
};

export default RequiredFieldToggle;

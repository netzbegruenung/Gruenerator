import type { ComponentType, JSX } from 'react';

import { cn } from '../lib/cn';
import { Switch } from './switch';

interface IconProps {
  className?: string;
}

interface FeatureToggleProps {
  isActive: boolean;
  onToggle?: (checked: boolean) => void;
  label: string;
  icon?: ComponentType<IconProps>;
  description?: string;
  className?: string;
  tabIndex?: number;
  disabled?: boolean;
  noBorder?: boolean;
}

function FeatureToggle({
  isActive,
  onToggle,
  label,
  icon: Icon,
  description,
  className,
  tabIndex,
  disabled = false,
  noBorder = false,
}: FeatureToggleProps): JSX.Element {
  const handleToggle = (checked: boolean) => {
    if (!disabled && onToggle) {
      onToggle(checked);
    }
  };

  return (
    <div
      className={cn(
        'relative flex flex-col p-md rounded-lg border border-grey-200 dark:border-grey-700 transition-all',
        disabled && 'opacity-50 cursor-not-allowed',
        noBorder && 'border-none p-0',
        className
      )}
    >
      <div className="flex items-center w-full gap-sm">
        <Switch
          className="h-[22px] w-[46px] data-[state=checked]:bg-secondary-600 data-[state=unchecked]:bg-grey-200 dark:data-[state=unchecked]:bg-grey-700"
          checked={isActive}
          onCheckedChange={handleToggle}
          aria-label={label}
          tabIndex={tabIndex}
          disabled={disabled}
        />
        <div className="flex items-center text-[0.9rem] text-foreground font-normal grow">
          {Icon && (
            <Icon
              className={cn(
                'mr-xs text-[1.1rem] text-foreground opacity-70 transition-all',
                isActive && 'text-secondary-600 opacity-100',
                disabled && 'opacity-40'
              )}
            />
          )}
          {label}
        </div>
      </div>

      {description && description.trim() && (
        <div className="mt-sm text-[0.9rem] text-foreground leading-relaxed opacity-80">
          {description}
        </div>
      )}
    </div>
  );
}

export { FeatureToggle, type FeatureToggleProps };

import * as Switch from '@radix-ui/react-switch';

import { cn } from '../../utils/cn';

import type { JSX, ComponentType } from 'react';

interface IconProps {
  className?: string;
}

interface FeatureToggleProps {
  isActive: boolean;
  onToggle?: (checked: boolean) => void;
  label: string;
  icon: ComponentType<IconProps>;
  description?: string;
  className?: string;
  tabIndex?: number;
  disabled?: boolean;
  noBorder?: boolean;
}

const FeatureToggle = ({
  isActive,
  onToggle,
  label,
  icon: Icon,
  description,
  className,
  tabIndex,
  disabled = false,
  noBorder = false,
}: FeatureToggleProps): JSX.Element => {
  const handleToggle = (checked: boolean) => {
    if (!disabled && onToggle) {
      onToggle(checked);
    }
  };

  return (
    <div
      className={cn(
        'relative flex flex-col p-md rounded-[var(--card-border-radius-small)] border border-[var(--card-border)] transition-all',
        disabled && 'opacity-50 cursor-not-allowed',
        noBorder && 'border-none p-0',
        className
      )}
    >
      <div className="flex items-center w-full gap-sm">
        <Switch.Root
          className={cn(
            'all-unset w-[46px] h-[22px] bg-[var(--input-background)] border border-[var(--input-border)] rounded-[22px] relative shadow-sm transition-all cursor-pointer shrink-0',
            'focus-visible:outline-2 focus-visible:outline-[var(--interactive-accent-color)] focus-visible:outline-offset-2',
            'data-[state=checked]:bg-[var(--interactive-accent-color)] data-[state=checked]:border-[var(--interactive-accent-color)] data-[state=checked]:shadow-md'
          )}
          checked={isActive}
          onCheckedChange={handleToggle}
          aria-label={label}
          tabIndex={tabIndex}
          disabled={disabled}
        >
          <Switch.Thumb
            className={cn(
              'block w-4 h-4 bg-background rounded-full shadow-sm transition-all translate-x-[3px] will-change-transform',
              'data-[state=checked]:translate-x-[27px] data-[state=checked]:bg-background-pure'
            )}
          />
        </Switch.Root>
        <div className="flex items-center text-[0.9rem] text-foreground font-normal grow">
          <Icon
            className={cn(
              'mr-xs text-[1.1rem] text-foreground opacity-70 transition-all',
              isActive && 'text-[var(--interactive-accent-color)] opacity-100',
              disabled && 'opacity-40'
            )}
          />
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
};

export default FeatureToggle;

import type { ComponentType } from 'react';
import * as Switch from '@radix-ui/react-switch';
import '../../assets/styles/components/ui/FeatureToggle.css';

interface FeatureToggleProps {
  isActive: boolean;
  onToggle?: (checked: boolean) => void;
  label: string;
  icon: ComponentType;
  description?: string;
  className?: string;
  tabIndex?: number;
  disabled?: boolean;
  noBorder?: boolean;
}

const FeatureToggle = ({ isActive,
  onToggle,
  label,
  icon: Icon,
  description,
  className,
  tabIndex,
  disabled = false,
  noBorder = false }: FeatureToggleProps): JSX.Element => {
  const handleToggle = (checked) => {
    if (!disabled && onToggle) {
      onToggle(checked);
    }
  };

  return (
    <div className={`feature-toggle ${className || ''} ${disabled ? 'feature-toggle-disabled' : ''} ${noBorder ? 'feature-toggle-no-border' : ''}`}>
      <div className="feature-header">
        <Switch.Root
          className="feature-switch"
          checked={isActive}
          onCheckedChange={handleToggle}
          aria-label={label}
          tabIndex={tabIndex}
          disabled={disabled}
        >
          <Switch.Thumb className="feature-switch-thumb" />
        </Switch.Root>
        <div className="feature-label">
          <Icon className={`feature-toggle-icon ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`} />
          {label} {isActive ? '' : ''}
        </div>
      </div>

      {description && description.trim() && (
        <div className="feature-description">
          {description}
        </div>
      )}
    </div>
  );
};

export default FeatureToggle;

import type { ChangeEvent } from 'react';
import * as Switch from '@radix-ui/react-switch';
import '../../assets/styles/components/ui/RequiredFieldToggle.css';

interface RequiredFieldToggleProps {
  checked?: boolean;
  onChange?: (event: React.ChangeEvent) => void;
  disabled?: boolean;
  label?: string;
  showLabel?: boolean;
}

const RequiredFieldToggle = ({ checked = false,
  onChange,
  disabled = false,
  label = 'Pflichtfeld',
  showLabel = true }: RequiredFieldToggleProps): JSX.Element => {
  const handleToggle = (newChecked) => {
    if (!disabled && onChange) {
      onChange(newChecked);
    }
  };

  return (
    <div className={`required-field-toggle ${disabled ? 'disabled' : ''}`}>
      <Switch.Root
        className="required-switch"
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={disabled}
        aria-label={label}
      >
        <Switch.Thumb className="required-switch-thumb" />
      </Switch.Root>
      {showLabel && (
        <span className="required-switch-label">
          {label}
        </span>
      )}
    </div>
  );
};

export default RequiredFieldToggle;

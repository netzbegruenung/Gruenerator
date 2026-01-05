import { JSX, useCallback } from 'react';
import '../../../assets/styles/components/ui/SegmentedControl.css';

// Define step interface
interface SegmentedStep {
  value: string | number;
  label: string;
  disabled?: boolean;
}

// Define the SegmentedControl component
interface SegmentedControlProps {
  steps: SegmentedStep[];
  currentValue?: string | number;
  onChange: (value: string | number) => void;
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
}

const SegmentedControl = ({
  steps = [],
  currentValue,
  onChange,
  disabled = false,
  label,
  ariaLabel = 'Select option',
}: SegmentedControlProps): JSX.Element => {

  // Handle button click
  const handleClick = useCallback((value: string | number, stepDisabled?: boolean) => {
    // Only call onChange if the specific step is not disabled,
    // the whole control is not disabled, and the value actually changes
    if (!stepDisabled && !disabled && value !== currentValue) {
      onChange(value);
    }
  }, [onChange, disabled, currentValue]);

  return (
    // New wrapper to include the label and apply frame styles
    <div className={`segmented-control-wrapper ${disabled ? 'disabled' : ''}`}>
      {label && <span className="segmented-control-label">{label}</span>}
      <div
        className={`segmented-control-container ${disabled ? 'disabled' : ''}`}
        role="group" // Using "group" for simplicity, could use "radiogroup" with more aria attributes
        aria-label={ariaLabel}
      >
        {steps.map((step) => {
          const isActive = step.value === currentValue;
          const isDisabled = step.disabled || disabled;
          return (
            <button
              key={step.value}
              type="button" // Important for forms
              className={`segmented-control-button ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
              onClick={() => handleClick(step.value, step.disabled)}
              disabled={isDisabled}
              aria-pressed={isActive} // Indicates the pressed state for assistive technologies
            // aria-label={step.label} // Optionally, if label text is not descriptive enough
            >
              {step.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SegmentedControl;

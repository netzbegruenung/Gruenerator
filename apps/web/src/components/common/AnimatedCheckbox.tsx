import * as Checkbox from '@radix-ui/react-checkbox';
import { motion } from 'motion/react';
import { useRef, type ChangeEvent } from 'react';
import '../../assets/styles/components/ui/animatedcheckbox.css';

export type CheckboxVariant = 'default' | 'simple';

interface SyntheticCheckboxEvent {
  target: {
    checked: boolean;
    type: 'checkbox';
    id: string;
  };
  currentTarget: {
    checked: boolean;
    type: 'checkbox';
    id: string;
  };
}

export interface AnimatedCheckboxProps {
  id?: string;
  checked: boolean;
  onChange: (event: SyntheticCheckboxEvent) => void;
  label: string;
  variant?: CheckboxVariant;
}

const AnimatedCheckbox = ({
  id,
  checked,
  onChange,
  label,
  variant = 'default',
}: AnimatedCheckboxProps) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;
  const hasInteracted = useRef(false);

  const handleCheckedChange = (newChecked: boolean) => {
    hasInteracted.current = true;
    const syntheticEvent: SyntheticCheckboxEvent = {
      target: {
        checked: newChecked,
        type: 'checkbox',
        id: checkboxId,
      },
      currentTarget: {
        checked: newChecked,
        type: 'checkbox',
        id: checkboxId,
      },
    };
    onChange(syntheticEvent);
  };

  const wrapperClass =
    variant === 'simple' ? 'checkbox-wrapper-28 checkbox-simple' : 'checkbox-wrapper-28';

  return (
    <div className={wrapperClass}>
      <Checkbox.Root
        id={checkboxId}
        checked={checked}
        onCheckedChange={handleCheckedChange}
        className="promoted-input-checkbox"
      >
        <Checkbox.Indicator className="checkbox-indicator-wrapper">
          <motion.svg
            xmlns="http://www.w3.org/2000/svg"
            className="checkbox-svg"
            viewBox="0 0 24 24"
            width="100%"
            height="100%"
            initial={{ scale: 0.8, opacity: 0, rotate: 0 }}
            animate={{
              scale: 0.8,
              opacity: checked ? 1 : 0,
              rotate: checked ? 3 : 0,
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 20,
            }}
          >
            <motion.path
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M1.73 12.91l6.37 6.37L22.79 4.59"
              initial={{ pathLength: checked ? 1 : 0 }}
              animate={{ pathLength: checked ? 1 : 0 }}
              transition={{
                duration: hasInteracted.current ? 0.3 : 0,
                ease: 'easeOut',
                delay: checked && hasInteracted.current ? 0.1 : 0,
              }}
            />
          </motion.svg>
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label htmlFor={checkboxId} className="checkbox-label-wrapper">
        <span className="checkbox-label">{label}</span>
      </label>
    </div>
  );
};

export default AnimatedCheckbox;

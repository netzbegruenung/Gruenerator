import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';
import * as Checkbox from '@radix-ui/react-checkbox';

const StyledCheckbox = ({ id, checked, onChange, label, variant = 'default' }) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;
  const hasInteracted = useRef(false);

  const handleCheckedChange = (newChecked) => {
    hasInteracted.current = true;
    // Create synthetic event to maintain compatibility with existing onChange handlers
    const syntheticEvent = {
      target: {
        checked: newChecked,
        type: 'checkbox',
        id: checkboxId
      },
      currentTarget: {
        checked: newChecked,
        type: 'checkbox',
        id: checkboxId
      }
    };
    onChange(syntheticEvent);
  };

  const wrapperClass = variant === 'simple' ? 'checkbox-wrapper-28 checkbox-simple' : 'checkbox-wrapper-28';

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
              rotate: checked ? 3 : 0
            }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 20 
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
                ease: "easeOut",
                delay: checked && hasInteracted.current ? 0.1 : 0
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

StyledCheckbox.propTypes = {
  id: PropTypes.string,
  checked: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  variant: PropTypes.oneOf(['default', 'simple'])
};

export default StyledCheckbox;
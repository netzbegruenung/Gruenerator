import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import { motion } from 'motion/react';

const StyledCheckbox = ({ id, checked, onChange, label, variant = 'default' }) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;
  const hasInteracted = useRef(false);

  const handleChange = (e) => {
    hasInteracted.current = true;
    onChange(e);
  };

  const wrapperClass = variant === 'simple' ? 'checkbox-wrapper-28 checkbox-simple' : 'checkbox-wrapper-28';

  return (
    <div className={wrapperClass}>
      <input
        id={checkboxId}
        type="checkbox"
        checked={checked}
        onChange={handleChange}
        className="promoted-input-checkbox"
      />
      <label htmlFor={checkboxId}>
        <motion.svg 
          xmlns="http://www.w3.org/2000/svg" 
          className="checkbox-svg" 
          viewBox="0 0 24 24"
          initial={{ scale: 0.8, opacity: 0, rotate: 0, y: "-50%" }}
          animate={{ 
            scale: 0.8, 
            opacity: checked ? 1 : 0,
            rotate: checked ? 3 : 0,
            y: "-50%"
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
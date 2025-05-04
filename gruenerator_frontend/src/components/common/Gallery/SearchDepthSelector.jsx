import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

const SearchDepthSelector = ({ options, currentValue, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectorRef = useRef(null); // Ref for the selector container

  const currentOption = options.find(option => option.value === currentValue) || options[0];

  const toggleDropdown = (e) => {
    e.stopPropagation(); // Prevent click from closing immediately
    setIsOpen(!isOpen);
  };

  const handleSelect = (option) => {
    if (!option.disabled) {
      onChange(option.value);
      setIsOpen(false);
    }
  };

  // Close dropdown if clicked outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (selectorRef.current && !selectorRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    // Add event listener when the dropdown is open
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      // Remove event listener when closed
      document.removeEventListener('mousedown', handleClickOutside);
    }

    // Cleanup function to remove the event listener
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]); // Re-run effect when isOpen changes

  return (
    <div className="search-depth-selector" ref={selectorRef}>
      <button
        type="button"
        className="selector-button"
        onClick={toggleDropdown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="selector-label">{currentOption?.label || 'Wählen...'}</span>
        {/* Simple arrow indicator */}
        <span className="selector-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <ul className="selector-dropdown" role="listbox">
          {options.map((option) => (
            <li
              key={option.value}
              className={`
                selector-option 
                ${option.value === currentValue ? 'selected' : ''}
                ${option.disabled ? 'disabled' : ''}
              `}
              onClick={() => handleSelect(option)}
              aria-selected={option.value === currentValue}
              role="option"
              tabIndex={option.disabled ? -1 : 0} // Make options focusable
              onKeyPress={(e) => {
                if (!option.disabled && (e.key === 'Enter' || e.key === ' ')) {
                  handleSelect(option);
                }
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

SearchDepthSelector.propTypes = {
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    disabled: PropTypes.bool,
  })).isRequired,
  currentValue: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
};

export default SearchDepthSelector;

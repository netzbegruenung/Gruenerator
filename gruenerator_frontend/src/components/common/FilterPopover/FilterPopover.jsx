import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import { createPortal } from 'react-dom';
import useClickOutside from '../../../hooks/useClickOutside';
import './FilterPopover.css';

const FilterPopover = ({ 
  isOpen, 
  onClose, 
  children, 
  anchorRef,
  title = "Filter",
  className = ""
}) => {
  const popoverRef = useClickOutside(onClose, isOpen);

  // Handle escape key and focus management
  useEffect(() => {
    if (isOpen) {
      // Focus the popover when it opens
      if (popoverRef.current) {
        popoverRef.current.focus();
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const popoverContent = (
    <div 
      ref={popoverRef}
      className={`filter-popover ${className}`}
      role="dialog"
      aria-labelledby="filter-popover-title"
      aria-modal="true"
      tabIndex={-1}
    >
      <div className="filter-popover-header">
        <h3 id="filter-popover-title" className="filter-popover-title">
          {title}
        </h3>
        <button 
          className="filter-popover-close"
          onClick={onClose}
          aria-label="Filter schließen"
          type="button"
        >
          ×
        </button>
      </div>
      
      <div className="filter-popover-body">
        {children}
      </div>
    </div>
  );

  // Render in portal to avoid z-index issues
  return createPortal(popoverContent, document.body);
};

FilterPopover.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  anchorRef: PropTypes.object,
  title: PropTypes.string,
  className: PropTypes.string
};

export default FilterPopover;
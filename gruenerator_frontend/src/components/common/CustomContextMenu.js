import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { HiCog } from 'react-icons/hi';

const CustomContextMenu = ({ position, onClose, onAdjustClick }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  return (
    <div 
      ref={menuRef}
      className="custom-context-menu"
      style={{
        top: `${position.y}px`,
        left: `${position.x}px`,
      }}
    >
      <button onClick={onAdjustClick}>
        <HiCog className="menu-icon" />
        Grünerator AI-Anpassung
      </button>
    </div>
  );
};

CustomContextMenu.propTypes = {
  position: PropTypes.shape({
    x: PropTypes.number.isRequired,
    y: PropTypes.number.isRequired,
  }).isRequired,
  onClose: PropTypes.func.isRequired,
  onAdjustClick: PropTypes.func.isRequired,
};

export default CustomContextMenu;
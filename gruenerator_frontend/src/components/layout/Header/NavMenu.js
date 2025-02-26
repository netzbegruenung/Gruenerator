import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { PiCaretDown, PiCaretUp } from 'react-icons/pi';
import { CSSTransition } from 'react-transition-group';
import useAccessibility from '../../hooks/useAccessibility';
import { menuItems, MenuItem, menuStyles, handleMenuInteraction } from './menuData';

const NavMenu = ({ open, onClose }) => {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { announce, setupKeyboardNav } = useAccessibility();
  const navMenuRef = useRef(null);
  const nodeRefs = {
    texte: useRef(null),
    grafik: useRef(null)
  };

  useEffect(() => {
    if (open) {
      onClose();
    }
  }, [location.pathname]);

  useEffect(() => {
    if (open && navMenuRef.current) {
      const menuElements = navMenuRef.current.querySelectorAll('a, button, .nav-dropdown > span');
      const cleanup = setupKeyboardNav(Array.from(menuElements));
      return cleanup;
    }
  }, [open, setupKeyboardNav]);

  const handleDropdownClick = (dropdown) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
    announce(activeDropdown === dropdown ? `${dropdown} Untermenü geschlossen` : `${dropdown} Untermenü geöffnet`);
  };

  const handleLinkClick = (path, label) => {
    navigate(path);
    setActiveDropdown(null);
    if (onClose) onClose();
    announce(`Navigation zu ${label}`);
  };

  const handleKeyDown = (event, dropdown) => {
    handleMenuInteraction(event, 'keydown', () => handleDropdownClick(dropdown));
  };

  const renderDropdownContent = (menuType) => {
    const menu = menuItems[menuType];
    return menu.items.map(item => (
      <li key={item.id}>
        <Link to={item.path} onClick={() => handleLinkClick(item.path, item.title)}>
          <MenuItem item={item} />
        </Link>
      </li>
    ));
  };

  return (
    <div 
      className={`nav-menu ${open ? 'open' : ''}`} 
      ref={navMenuRef} 
      aria-label="Mobile Navigation" 
      role="navigation"
    >
      {Object.entries(menuItems).map(([key, menu]) => (
        <div key={key} className="nav-dropdown">
          <span 
            onClick={() => handleDropdownClick(key)}
            onKeyDown={(e) => handleKeyDown(e, key)}
            tabIndex="0"
            role="button"
            aria-haspopup="true"
            aria-expanded={activeDropdown === key}
          >
            {menu.title}
            {activeDropdown === key ? 
              <PiCaretUp className="nav-icon dropdown-icon" aria-hidden="true" /> : 
              <PiCaretDown className="nav-icon dropdown-icon" aria-hidden="true" />
            }
          </span>
          <CSSTransition
            in={activeDropdown === key}
            timeout={300}
            classNames="dropdown"
            unmountOnExit
            nodeRef={nodeRefs[key]}
          >
            <ul 
              className={`${menuStyles.dropdownContent.base} ${menuStyles.dropdownContent.mobile}`}
              ref={nodeRefs[key]}
              aria-label={`${menu.title} Untermenü`}
            >
              {renderDropdownContent(key)}
            </ul>
          </CSSTransition>
        </div>
      ))}
    </div>
  );
};

NavMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default NavMenu;
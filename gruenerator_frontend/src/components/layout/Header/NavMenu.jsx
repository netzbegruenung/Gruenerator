import React, { useState, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { PiCaretDown, PiCaretUp } from 'react-icons/pi';
import { CSSTransition } from 'react-transition-group';
import useAccessibility from '../../hooks/useAccessibility';
import { menuItems, directMenuItems, handleMenuInteraction } from './menuData';

const MenuItem = ({ icon: Icon, title, description, path, onClick, isTopLevel = false }) => (
  <div className={`menu-item ${isTopLevel ? 'menu-item--top-level' : ''}`}>
    <Link to={path} onClick={onClick} className="menu-item__link">
      <div className="menu-item__content">
        {!isTopLevel && Icon && <Icon className="menu-item__icon" aria-hidden="true" />}
        <div className="menu-item__text">
          <span className="menu-item__title">{title}</span>
          {!isTopLevel && description && (
            <p className="menu-item__description">{description}</p>
          )}
        </div>
      </div>
    </Link>
  </div>
);

MenuItem.propTypes = {
  icon: PropTypes.elementType,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  path: PropTypes.string.isRequired,
  onClick: PropTypes.func.isRequired,
  isTopLevel: PropTypes.bool
};

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
        <MenuItem
          icon={item.icon}
          title={item.title}
          description={item.description}
          path={item.path}
          onClick={() => handleLinkClick(item.path, item.title)}
        />
      </li>
    ));
  };

  return (
    <nav 
      className={`nav-menu ${open ? 'nav-menu--open' : ''}`} 
      ref={navMenuRef} 
      aria-label="Mobile Navigation"
    >
      {Object.entries(menuItems).map(([key, menu]) => (
        <div key={key} className="nav-menu__dropdown">
          <span 
            onClick={() => handleDropdownClick(key)}
            onKeyDown={(e) => handleKeyDown(e, key)}
            tabIndex="0"
            role="button"
            aria-haspopup="true"
            aria-expanded={activeDropdown === key}
            className="nav-menu__dropdown-trigger"
          >
            {menu.title}
            {activeDropdown === key ? 
              <PiCaretUp className="nav-menu__icon nav-menu__icon--up" aria-hidden="true" /> : 
              <PiCaretDown className="nav-menu__icon nav-menu__icon--down" aria-hidden="true" />
            }
          </span>
          <CSSTransition
            in={activeDropdown === key}
            timeout={300}
            classNames={{
              enter: 'dropdown-enter',
              enterActive: 'dropdown-enter-active',
              exit: 'dropdown-exit',
              exitActive: 'dropdown-exit-active'
            }}
            unmountOnExit
            nodeRef={nodeRefs[key]}
          >
            <ul 
              className="nav-menu__dropdown-content"
              ref={nodeRefs[key]}
              aria-label={`${menu.title} Untermenü`}
            >
              {renderDropdownContent(key)}
            </ul>
          </CSSTransition>
        </div>
      ))}
      <MenuItem
        icon={directMenuItems.suche.icon}
        title={directMenuItems.suche.title}
        description={directMenuItems.suche.description}
        path={directMenuItems.suche.path}
        onClick={() => handleLinkClick(directMenuItems.suche.path, directMenuItems.suche.title)}
        isTopLevel={true}
      />
      {/* Reel MenuItem vorübergehend auskommentiert
      <MenuItem
        icon={directMenuItems.reel.icon}
        title={directMenuItems.reel.title}
        description={directMenuItems.reel.description}
        path={directMenuItems.reel.path}
        onClick={() => handleLinkClick(directMenuItems.reel.path, directMenuItems.reel.title)}
        isTopLevel={true}
      />
      */}
    </nav>
  );
};

NavMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default NavMenu;
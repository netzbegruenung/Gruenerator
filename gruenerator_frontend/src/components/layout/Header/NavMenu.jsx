import React, { useState, useRef, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { PiCaretDown, PiCaretUp } from 'react-icons/pi';
import { CSSTransition } from 'react-transition-group';
import useAccessibility from '../../hooks/useAccessibility';
import { getMenuItems, getDirectMenuItems, handleMenuInteraction as commonHandleMenuInteraction } from './menuData';
import ProfileButton from './ProfileButton';
import ThemeToggleButton from './ThemeToggleButton';
import { BetaFeaturesContext } from '../../../context/BetaFeaturesContext';

const MenuItem = ({ icon: Icon, title, description, path, onClick, isTopLevel = false }) => (
  <div className={`menu-item ${isTopLevel ? 'menu-item--top-level' : ''}`}>
    <Link to={path} onClick={onClick} className="menu-item__link">
      <div className="menu-item__content">
        {Icon && <Icon className="menu-item__icon" aria-hidden="true" />}
        <div className="menu-item__text">
          <span className="menu-item__title">{title}</span>
          {description && (
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

const NavMenu = ({ open, onClose, darkMode, toggleDarkMode }) => {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { announce, setupKeyboardNav } = useAccessibility();
  const navMenuRef = useRef(null);
  const { sharepicBetaEnabled, databaseBetaEnabled } = useContext(BetaFeaturesContext);

  const menuItems = getMenuItems({ sharepicBetaEnabled, databaseBetaEnabled });
  const directMenuItems = getDirectMenuItems({ sharepicBetaEnabled, databaseBetaEnabled });
  const dynamicTopLevelItems = Object.values(directMenuItems);

  const nodeRefs = Object.keys(menuItems).reduce((acc, key) => {
    acc[key] = useRef(null);
    return acc;
  }, {});

  useEffect(() => {
    if (open) {
      onClose();
    }
  }, [location.pathname, onClose]);

  useEffect(() => {
    if (open && navMenuRef.current) {
      const menuElements = navMenuRef.current.querySelectorAll('a, button, .nav-menu__dropdown-trigger');
      const cleanup = setupKeyboardNav(Array.from(menuElements));
      return cleanup;
    }
  }, [open, setupKeyboardNav]);

  const handleDropdownClick = (dropdown) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
    announce(activeDropdown === dropdown ? `${menuItems[dropdown]?.title} Untermenü geschlossen` : `${menuItems[dropdown]?.title} Untermenü geöffnet`);
  };

  const handleLinkClick = (path, label) => {
    navigate(path);
    setActiveDropdown(null);
    if (onClose) onClose();
    announce(`Navigation zu ${label}`);
  };

  const handleKeyDown = (event, dropdown) => {
    commonHandleMenuInteraction(event, 'keydown', () => handleDropdownClick(dropdown));
  };

  const renderDropdownContent = (menuType) => {
    const menu = menuItems[menuType];
    if (!menu || !menu.items) return null;
    return menu.items.map(item => (
      <li key={item.id}>
        <MenuItem
          icon={item.icon}
          title={item.title}
          description={item.description}
          path={item.path}
          onClick={() => handleLinkClick(item.path, item.title)}
          isTopLevel={false}
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
            {menu.icon && <menu.icon style={{ marginRight: '8px' }} />}
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
      
      {dynamicTopLevelItems.map(item => (
        <MenuItem
          key={item.id}
          icon={item.icon}
          title={item.title}
          description={item.description}
          path={item.path}
          onClick={() => handleLinkClick(item.path, item.title)}
          isTopLevel={true}
        />
      ))}
      
      <div className="nav-menu__divider"></div>
      <div className="nav-menu__item">
        <div className="menu-item menu-item--top-level">
          <div className="menu-item__content">
            <div className="menu-item__text">
              <span className="menu-item__title">Mein Konto</span>
            </div>
            <div className="menu-item__profile-wrapper">
              <ProfileButton />
            </div>
          </div>
        </div>
      </div>
      
      <div className="nav-menu__theme-toggle">
        <ThemeToggleButton darkMode={darkMode} toggleDarkMode={toggleDarkMode} />
      </div>
    </nav>
  );
};

NavMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  darkMode: PropTypes.bool,
  toggleDarkMode: PropTypes.func
};

export default NavMenu;
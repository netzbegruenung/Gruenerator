import React, { useState, useRef, useEffect, useContext } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import useAccessibility from '../../hooks/useAccessibility';
import { getMenuItems, getDirectMenuItems, getMobileOnlyMenuItems, handleMenuInteraction as commonHandleMenuInteraction } from './menuData';
import { useLazyAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import Icon from '../../common/Icon';

const MenuItem = ({ icon: IconComponent, title, description, path, onClick, isTopLevel = false }) => (
  <div className={`menu-item ${isTopLevel ? 'menu-item--top-level' : ''}`}>
    <Link to={path} onClick={onClick} className="menu-item__link">
      <div className="menu-item__content">
        {!isTopLevel && IconComponent && <IconComponent className="menu-item__icon" aria-hidden="true" />}
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

const NavMenu = ({ open, onClose }) => {
  const [activeDropdown, setActiveDropdown] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { announce } = useAccessibility();
  const navMenuRef = useRef(null);
  useLazyAuth(); // Keep for other auth functionality
  const { getBetaFeatureState } = useBetaFeatures();
  const databaseBetaEnabled = getBetaFeatureState('database');

  const menuItems = getMenuItems({ databaseBetaEnabled });
  const directMenuItems = getDirectMenuItems({ databaseBetaEnabled });
  const mobileOnlyItems = getMobileOnlyMenuItems();
  const dynamicTopLevelItems = [...Object.values(directMenuItems), ...Object.values(mobileOnlyItems)];


  useEffect(() => {
    if (onClose) {
      onClose();
    }
  }, [location.pathname]);

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
              <Icon category="ui" name="caretUp" className="nav-menu__icon nav-menu__icon--up" aria-hidden="true" /> : 
              <Icon category="ui" name="caretDown" className="nav-menu__icon nav-menu__icon--down" aria-hidden="true" />
            }
          </span>
          <AnimatePresence>
            {activeDropdown === key && (
              <motion.ul 
                className="nav-menu__dropdown-content"
                aria-label={`${menu.title} Untermenü`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
              >
                {renderDropdownContent(key)}
              </motion.ul>
            )}
          </AnimatePresence>
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
    </nav>
  );
};

NavMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

export default NavMenu;
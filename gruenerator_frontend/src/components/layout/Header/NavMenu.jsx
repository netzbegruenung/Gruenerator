import React, { useState, useRef, useEffect, useContext, useMemo } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import useAccessibility from '../../hooks/useAccessibility';
import { getMenuItems, getDirectMenuItems, getMobileOnlyMenuItems, handleMenuInteraction as commonHandleMenuInteraction } from './menuData';
import { useLazyAuth, useOptimizedAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useProfileStore } from '../../../stores/profileStore';
import { useCustomGeneratorsData } from '../../../features/auth/hooks/useProfileData';
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
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { announce } = useAccessibility();
  const navMenuRef = useRef(null);
  useLazyAuth(); // Keep for other auth functionality
  const { user } = useOptimizedAuth();
  const { getBetaFeatureState } = useBetaFeatures();

  const databaseBetaEnabled = useMemo(() => getBetaFeatureState('database'), [getBetaFeatureState]);
  const chatBetaEnabled = useMemo(() => getBetaFeatureState('chat'), [getBetaFeatureState]);
  const customGrueneratorBetaEnabled = useMemo(() => getBetaFeatureState('customGruenerator'), [getBetaFeatureState]);

  // Fetch custom generators when feature is enabled
  useCustomGeneratorsData({ isActive: customGrueneratorBetaEnabled && !!user?.id });
  const customGenerators = useProfileStore(state => state.customGenerators) || [];

  // Memoize menu items to prevent unnecessary recalculations
  const menuItems = useMemo(() => getMenuItems(
    { databaseBetaEnabled, chatBetaEnabled, customGrueneratorBetaEnabled },
    customGenerators
  ), [databaseBetaEnabled, chatBetaEnabled, customGrueneratorBetaEnabled, customGenerators]);
  const directMenuItems = useMemo(() => getDirectMenuItems({ databaseBetaEnabled, chatBetaEnabled }), [databaseBetaEnabled, chatBetaEnabled]);
  const mobileOnlyItems = useMemo(() => getMobileOnlyMenuItems(), []);
  const dynamicTopLevelItems = useMemo(() => [...Object.values(directMenuItems), ...Object.values(mobileOnlyItems)], [directMenuItems, mobileOnlyItems]);


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

  const handleSubmenuClick = (itemId) => {
    setActiveSubmenu(activeSubmenu === itemId ? null : itemId);
  };

  const renderDropdownContent = (menuType) => {
    const menu = menuItems[menuType];
    if (!menu || !menu.items) return null;
    return menu.items.map(item => {
      // Handle items with sub-menus
      if (item.hasSubmenu && item.items) {
        return (
          <li key={item.id} className="nav-menu__submenu-container">
            <span
              className="nav-menu__submenu-trigger"
              onClick={() => handleSubmenuClick(item.id)}
              onKeyDown={(e) => commonHandleMenuInteraction(e, 'keydown', () => handleSubmenuClick(item.id))}
              tabIndex="0"
              role="button"
              aria-haspopup="true"
              aria-expanded={activeSubmenu === item.id}
            >
              {item.icon && <item.icon className="menu-item__icon" aria-hidden="true" />}
              <span className="menu-item__title">{item.title}</span>
              {activeSubmenu === item.id ?
                <Icon category="ui" name="caretUp" className="nav-menu__icon nav-menu__icon--up" aria-hidden="true" /> :
                <Icon category="ui" name="caretDown" className="nav-menu__icon nav-menu__icon--down" aria-hidden="true" />
              }
            </span>
            <AnimatePresence>
              {activeSubmenu === item.id && (
                <motion.ul
                  className="nav-menu__submenu-content"
                  aria-label={`${item.title} Untermenü`}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  {item.items.map(subItem => (
                    <li key={subItem.id}>
                      <MenuItem
                        icon={subItem.icon}
                        title={subItem.title}
                        description={subItem.description}
                        path={subItem.path}
                        onClick={() => handleLinkClick(subItem.path, subItem.title)}
                        isTopLevel={false}
                      />
                    </li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </li>
        );
      }

      // Regular menu items
      return (
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
      );
    });
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
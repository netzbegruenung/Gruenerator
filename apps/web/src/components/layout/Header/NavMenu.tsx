import { JSX, useState, useRef, useEffect, useMemo, ComponentType, MouseEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import useAccessibility from '../../hooks/useAccessibility';
import { getMenuItems, getDirectMenuItems, getMobileOnlyMenuItems, handleMenuInteraction as commonHandleMenuInteraction, type MenuItemType, type MenuSection, type MenuItemsResult } from './menuData';
import { useLazyAuth, useOptimizedAuth } from '../../../hooks/useAuth';
import { useBetaFeatures } from '../../../hooks/useBetaFeatures';
import { useProfileStore } from '../../../stores/profileStore';
import { useAuthStore } from '../../../stores/authStore';
import { useCustomGeneratorsData } from '../../../features/auth/hooks/useProfileData';
import Icon from '../../common/Icon';
import type { IconType } from 'react-icons';

interface NavMenuItemProps {
  icon?: IconType | ComponentType | null;
  title: string;
  description?: string;
  path: string;
  onClick: (event: React.MouseEvent) => void;
  isTopLevel?: boolean;
}

interface NavMenuProps {
  open: boolean;
  onClose: () => void;
}

const NavMenuItem = ({ icon: IconComponent, title, description, path, onClick, isTopLevel = false }: NavMenuItemProps): JSX.Element => (
  <div className={`menu-item ${isTopLevel ? 'menu-item--top-level' : ''}`}>
    <Link to={path} onClick={onClick} className="menu-item__link">
      <div className="menu-item__content">
        {!isTopLevel && IconComponent && <IconComponent aria-hidden="true" />}
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

const NavMenu = ({ open, onClose }: NavMenuProps) => {
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { announce } = useAccessibility();
  const navMenuRef = useRef<HTMLElement>(null);
  useLazyAuth(); // Keep for other auth functionality
  const { user } = useOptimizedAuth();
  const { getBetaFeatureState } = useBetaFeatures();

  const databaseBetaEnabled = useMemo(() => getBetaFeatureState('database'), [getBetaFeatureState]);
  const chatBetaEnabled = useMemo(() => getBetaFeatureState('chat'), [getBetaFeatureState]);
  const locale = useAuthStore((state) => state.locale);
  const isAustrian = locale === 'de-AT';

  // Fetch custom generators for authenticated users
  useCustomGeneratorsData({ enabled: !!user?.id });
  const customGenerators = useProfileStore(state => state.customGenerators) || [];

  // Memoize menu items to prevent unnecessary recalculations
  const menuItems = useMemo(() => getMenuItems(
    { databaseBetaEnabled, chatBetaEnabled, isAustrian }
  ), [databaseBetaEnabled, chatBetaEnabled, isAustrian]);
  const directMenuItems = useMemo(() => getDirectMenuItems({ databaseBetaEnabled, chatBetaEnabled, isAustrian }), [databaseBetaEnabled, chatBetaEnabled, isAustrian]);
  const mobileOnlyItems = useMemo(() => getMobileOnlyMenuItems(), []);
  const dynamicTopLevelItems = useMemo<MenuItemType[]>(() => [...Object.values(directMenuItems), ...Object.values(mobileOnlyItems)], [directMenuItems, mobileOnlyItems]);

  useEffect(() => {
    if (onClose) {
      onClose();
    }
  }, [location.pathname]);

  const handleDropdownClick = (dropdown: string) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
    announce(activeDropdown === dropdown ? `${menuItems[dropdown as keyof typeof menuItems]?.title} Untermenü geschlossen` : `${menuItems[dropdown as keyof typeof menuItems]?.title} Untermenü geöffnet`);
  };

  const handleLinkClick = (path: string, label: string) => {
    navigate(path);
    setActiveDropdown(null);
    if (onClose) onClose();
    announce(`Navigation zu ${label}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent, dropdown: string) => {
    commonHandleMenuInteraction(event, 'keydown', () => handleDropdownClick(dropdown));
  };

  const handleSubmenuClick = (itemId: string) => {
    setActiveSubmenu(activeSubmenu === itemId ? null : itemId);
  };

  const renderDropdownContent = (menuType: keyof typeof menuItems) => {
    const menu = menuItems[menuType];
    if (!menu || !menu.items) return null;
    return menu.items.map((item: MenuItemType) => {
      // Handle items with sub-menus
      if (item.hasSubmenu && item.items) {
        const ItemIcon = item.icon;
        return (
          <li key={item.id} className="nav-menu__submenu-container">
            <span
              className="nav-menu__submenu-trigger"
              onClick={() => handleSubmenuClick(item.id)}
              onKeyDown={(e: React.KeyboardEvent) => commonHandleMenuInteraction(e, 'keydown', () => handleSubmenuClick(item.id))}
              tabIndex={0}
              role="button"
              aria-haspopup="true"
              aria-expanded={activeSubmenu === item.id}
            >
              {ItemIcon && <ItemIcon aria-hidden="true" />}
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
                  {item.items.map((subItem: MenuItemType) => (
                    <li key={subItem.id}>
                      <NavMenuItem
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
          <NavMenuItem
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
      {(Object.entries(menuItems) as [keyof typeof menuItems, MenuSection][]).map(([key, menu]) => (
        <div key={key} className="nav-menu__dropdown">
          <span
            onClick={() => handleDropdownClick(key)}
            onKeyDown={(e: React.KeyboardEvent) => handleKeyDown(e, key)}
            tabIndex={0}
            role="button"
            aria-haspopup="true"
            aria-expanded={activeDropdown === key}
            className="nav-menu__dropdown-trigger"
          >
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

      {dynamicTopLevelItems.map((item: MenuItemType) => (
        <NavMenuItem
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

export default NavMenu;

import { motion, AnimatePresence } from 'motion/react';
import { memo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';

import Icon from '../../common/Icon';
import { StatusBadge } from '../../common/StatusBadge';

import type { MenuItemType } from '../Header/menuData';

interface SidebarSectionProps {
  sectionKey: string;
  title: string;
  items: MenuItemType[];
  isOpen: boolean;
  onToggle: () => void;
  onLinkClick: (path: string, title?: string) => void;
  isDesktop?: boolean;
  isActive?: (path: string) => boolean;
  sidebarExpanded?: boolean;
}

interface SidebarMenuItemProps {
  item: MenuItemType;
  onLinkClick: (path: string, title?: string) => void;
  isSubmenu?: boolean;
  isDesktop?: boolean;
  isActive?: (path: string) => boolean;
}

const SidebarMenuItem = memo(
  ({ item, onLinkClick, isSubmenu = false, isDesktop = false, isActive }: SidebarMenuItemProps) => {
    const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);

    const handleSubmenuToggle = useCallback(() => {
      setIsSubmenuOpen((prev) => !prev);
    }, []);

    if (item.hasSubmenu && item.items) {
      return (
        <li className="sidebar-submenu-container">
          <button
            className="sidebar-submenu-trigger"
            onClick={handleSubmenuToggle}
            aria-expanded={isSubmenuOpen}
            aria-haspopup="true"
          >
            {item.icon && <item.icon aria-hidden="true" className="sidebar-item-icon" />}
            <span className="sidebar-item-title">{item.title}</span>
            {item.badge && <StatusBadge type={item.badge} variant="sidebar" />}
            <Icon
              category="ui"
              name={isSubmenuOpen ? 'caretUp' : 'caretDown'}
              className="sidebar-caret"
              aria-hidden="true"
            />
          </button>
          <AnimatePresence>
            {isSubmenuOpen && (
              <motion.ul
                className="sidebar-submenu-content"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
              >
                {item.items.map((subItem) => (
                  <SidebarMenuItem
                    key={subItem.id}
                    item={subItem}
                    onLinkClick={onLinkClick}
                    isSubmenu={true}
                    isDesktop={isDesktop}
                    isActive={isActive}
                  />
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </li>
      );
    }

    if (!item.path) {
      return (
        <li className={isSubmenu ? 'sidebar-submenu-item' : ''}>
          <span className="sidebar-menu-link sidebar-menu-link--disabled">
            {item.icon && <item.icon aria-hidden="true" className="sidebar-item-icon" />}
            <span className="sidebar-item-title">{item.title}</span>
            {item.badge && <StatusBadge type={item.badge} variant="sidebar" />}
          </span>
        </li>
      );
    }

    const active = isActive?.(item.path) ?? false;

    if (isDesktop) {
      return (
        <li className={isSubmenu ? 'sidebar-submenu-item' : ''}>
          <button
            type="button"
            className={`sidebar-menu-link ${active ? 'sidebar-menu-link--active' : ''}`}
            onClick={() => onLinkClick(item.path!, item.title)}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon && <item.icon aria-hidden="true" className="sidebar-item-icon" />}
            <span className="sidebar-item-title">{item.title}</span>
            {item.badge && <StatusBadge type={item.badge} variant="sidebar" />}
          </button>
        </li>
      );
    }

    return (
      <li className={isSubmenu ? 'sidebar-submenu-item' : ''}>
        <Link
          to={item.path}
          className="sidebar-menu-link"
          onClick={(e) => {
            e.preventDefault();
            onLinkClick(item.path!, item.title);
          }}
        >
          {item.icon && <item.icon aria-hidden="true" className="sidebar-item-icon" />}
          <span className="sidebar-item-title">{item.title}</span>
          {item.badge && <StatusBadge type={item.badge} variant="sidebar" />}
        </Link>
      </li>
    );
  }
);

SidebarMenuItem.displayName = 'SidebarMenuItem';

const SidebarSection = memo(
  ({
    sectionKey,
    title,
    items,
    isOpen,
    onToggle,
    onLinkClick,
    isDesktop = false,
    isActive,
    sidebarExpanded = false,
  }: SidebarSectionProps) => {
    // For desktop: show all items without accordion behavior
    if (isDesktop) {
      return (
        <div className="sidebar-section">
          {sidebarExpanded && <span className="sidebar-section-title-static">{title}</span>}
          <ul className="sidebar-section-content sidebar-section-content--static">
            {items.map((item) => (
              <SidebarMenuItem
                key={item.id}
                item={item}
                onLinkClick={onLinkClick}
                isDesktop={isDesktop}
                isActive={isActive}
              />
            ))}
          </ul>
        </div>
      );
    }

    return (
      <div className="sidebar-section">
        <button
          className="sidebar-section-header"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`sidebar-section-${sectionKey}`}
        >
          <span className="sidebar-section-title">{title}</span>
          <Icon
            category="ui"
            name={isOpen ? 'caretUp' : 'caretDown'}
            className="sidebar-section-caret"
            aria-hidden="true"
          />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.ul
              id={`sidebar-section-${sectionKey}`}
              className="sidebar-section-content"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
            >
              {items.map((item) => (
                <SidebarMenuItem key={item.id} item={item} onLinkClick={onLinkClick} />
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    );
  }
);

SidebarSection.displayName = 'SidebarSection';

export default SidebarSection;

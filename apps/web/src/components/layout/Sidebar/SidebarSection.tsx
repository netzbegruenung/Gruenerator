import { memo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import Icon from '../../common/Icon';
import type { MenuItemType } from '../Header/menuData';

interface SidebarSectionProps {
  sectionKey: string;
  title: string;
  items: MenuItemType[];
  isOpen: boolean;
  onToggle: () => void;
  onLinkClick: (path: string) => void;
}

interface SidebarMenuItemProps {
  item: MenuItemType;
  onLinkClick: (path: string) => void;
  isSubmenu?: boolean;
}

const SidebarMenuItem = memo(({ item, onLinkClick, isSubmenu = false }: SidebarMenuItemProps) => {
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);

  const handleSubmenuToggle = useCallback(() => {
    setIsSubmenuOpen(prev => !prev);
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
                />
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
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
          onLinkClick(item.path);
        }}
      >
        {item.icon && <item.icon aria-hidden="true" className="sidebar-item-icon" />}
        <span className="sidebar-item-title">{item.title}</span>
      </Link>
    </li>
  );
});

SidebarMenuItem.displayName = 'SidebarMenuItem';

const SidebarSection = memo(({
  sectionKey,
  title,
  items,
  isOpen,
  onToggle,
  onLinkClick
}: SidebarSectionProps) => {
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
              <SidebarMenuItem
                key={item.id}
                item={item}
                onLinkClick={onLinkClick}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
});

SidebarSection.displayName = 'SidebarSection';

export default SidebarSection;

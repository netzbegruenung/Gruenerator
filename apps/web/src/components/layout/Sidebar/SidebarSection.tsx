import { motion, AnimatePresence } from 'motion/react';
import { memo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';

import Icon from '../../common/Icon';
import { StatusBadge } from '../../common/StatusBadge';

import type { MenuItemType } from '../Header/menuData';

import { cn } from '@/utils/cn';

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
  sidebarExpanded?: boolean;
}

const menuLinkClass = (active: boolean, disabled?: boolean) =>
  cn(
    'flex items-center gap-md py-sm px-xs pl-2 mx-2 rounded-sm min-h-[40px] no-underline whitespace-nowrap transition-colors text-foreground hover:bg-hover-alt active:bg-[var(--hover-color)]',
    active && 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-200',
    disabled && 'opacity-55 cursor-default pointer-events-none'
  );

const submenuLinkClass = (active: boolean, disabled?: boolean) =>
  cn(
    'flex items-center gap-md py-xs px-sm mx-2 rounded-sm min-h-[36px] no-underline whitespace-nowrap transition-colors text-foreground hover:bg-hover-alt active:bg-[var(--hover-color)]',
    active && 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-200',
    disabled && 'opacity-55 cursor-default pointer-events-none'
  );

const iconClass =
  'text-[1.4rem] text-foreground shrink-0 w-6 flex items-center justify-center transition-colors xl:text-[1.5rem] 2xl:text-[1.6rem] 2xl:w-7';
const submenuIconClass =
  'text-[1.2rem] text-foreground shrink-0 w-5 flex items-center justify-center transition-colors';

const SidebarMenuItem = memo(
  ({
    item,
    onLinkClick,
    isSubmenu = false,
    isDesktop = false,
    isActive,
    sidebarExpanded = false,
  }: SidebarMenuItemProps) => {
    const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);

    const handleSubmenuToggle = useCallback(() => {
      setIsSubmenuOpen((prev) => !prev);
    }, []);

    const linkCls = isSubmenu ? submenuLinkClass : menuLinkClass;
    const icoClass = isSubmenu ? submenuIconClass : iconClass;

    const titleClass = cn(
      'font-semibold text-foreground-heading leading-snug transition-all duration-150 font-[Raleway,PT_Sans,Arial,sans-serif]',
      isSubmenu ? 'text-[0.85rem] font-medium' : 'text-[0.95rem] xl:text-[1rem] 2xl:text-[1.05rem]',
      sidebarExpanded ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2'
    );

    const badgeClass = cn(
      'ml-auto transition-opacity duration-150',
      sidebarExpanded ? 'opacity-100' : 'opacity-0'
    );

    const caretClass = cn(
      'text-[0.9rem] text-foreground ml-auto shrink-0 transition-opacity duration-150',
      sidebarExpanded ? 'opacity-100' : 'opacity-0'
    );

    if (item.hasSubmenu && item.items) {
      return (
        <li className="list-none">
          <button
            className="flex items-center gap-md w-full py-sm px-sm border-none bg-transparent cursor-pointer text-foreground-heading font-[Raleway,PT_Sans,Arial,sans-serif] text-[0.95rem] font-semibold text-left rounded-sm transition-colors whitespace-nowrap hover:bg-hover-alt"
            onClick={handleSubmenuToggle}
            aria-expanded={isSubmenuOpen}
            aria-haspopup="true"
          >
            {item.icon && <item.icon aria-hidden="true" className={icoClass} />}
            <span className={titleClass}>{item.title}</span>
            {item.badge && (
              <span className={badgeClass}>
                <StatusBadge type={item.badge} variant="sidebar" />
              </span>
            )}
            <Icon
              category="ui"
              name={isSubmenuOpen ? 'caretUp' : 'caretDown'}
              className={caretClass}
              aria-hidden="true"
            />
          </button>
          <AnimatePresence>
            {isSubmenuOpen && (
              <motion.ul
                className="list-none m-0 p-0 pl-md overflow-hidden"
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
                    sidebarExpanded={sidebarExpanded}
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
        <li className={isSubmenu ? '' : ''}>
          <span className={linkCls(false, true)}>
            {item.icon && <item.icon aria-hidden="true" className={icoClass} />}
            <span className={titleClass}>{item.title}</span>
            {item.badge && (
              <span className={badgeClass}>
                <StatusBadge type={item.badge} variant="sidebar" />
              </span>
            )}
          </span>
        </li>
      );
    }

    const active = isActive?.(item.path) ?? false;

    if (isDesktop) {
      return (
        <li>
          <button
            type="button"
            className={linkCls(active)}
            onClick={() => onLinkClick(item.path!, item.title)}
            aria-current={active ? 'page' : undefined}
          >
            {item.icon && <item.icon aria-hidden="true" className={icoClass} />}
            <span className={titleClass}>{item.title}</span>
            {item.badge && (
              <span className={badgeClass}>
                <StatusBadge type={item.badge} variant="sidebar" />
              </span>
            )}
          </button>
        </li>
      );
    }

    return (
      <li>
        <Link
          to={item.path}
          className={linkCls(false)}
          onClick={(e) => {
            e.preventDefault();
            onLinkClick(item.path!, item.title);
          }}
        >
          {item.icon && <item.icon aria-hidden="true" className={icoClass} />}
          <span className={titleClass}>{item.title}</span>
          {item.badge && (
            <span className={badgeClass}>
              <StatusBadge type={item.badge} variant="sidebar" />
            </span>
          )}
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
        <div className="mb-xs px-xs last:mb-0">
          {sidebarExpanded && (
            <span className="block py-2 px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.5px] text-grey-500 whitespace-nowrap">
              {title}
            </span>
          )}
          <ul className="list-none m-0 p-0">
            {items.map((item) => (
              <SidebarMenuItem
                key={item.id}
                item={item}
                onLinkClick={onLinkClick}
                isDesktop={isDesktop}
                isActive={isActive}
                sidebarExpanded={sidebarExpanded}
              />
            ))}
          </ul>
        </div>
      );
    }

    return (
      <div className="mb-xs px-xs last:mb-0">
        <button
          className="flex items-center justify-between w-full py-sm px-sm border-none bg-transparent cursor-pointer text-foreground font-[Raleway,PT_Sans,Arial,sans-serif] text-[0.7rem] font-bold text-left uppercase tracking-[0.08em] rounded-sm transition-colors whitespace-nowrap overflow-hidden hover:bg-hover-alt"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={`sidebar-section-${sectionKey}`}
        >
          <span
            className={cn(
              'flex-1 transition-opacity duration-150',
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            )}
          >
            {title}
          </span>
          <Icon
            category="ui"
            name={isOpen ? 'caretUp' : 'caretDown'}
            className={cn(
              'text-[0.9rem] text-foreground shrink-0 transition-all duration-200',
              sidebarExpanded ? 'opacity-100' : 'opacity-0'
            )}
            aria-hidden="true"
          />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.ul
              id={`sidebar-section-${sectionKey}`}
              className="list-none m-0 p-0 overflow-hidden"
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
                  sidebarExpanded={sidebarExpanded}
                />
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

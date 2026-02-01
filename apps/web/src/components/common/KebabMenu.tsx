import React, { useState, useRef, useEffect, useCallback } from 'react';
import { HiDotsVertical } from 'react-icons/hi';

import '../../assets/styles/components/common/kebab-menu.css';

import type { JSX, ReactNode } from 'react';

export interface KebabMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface KebabMenuProps {
  items: KebabMenuItem[];
}

const KebabMenu = ({ items }: KebabMenuProps): JSX.Element => {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        close();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, close]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((prev) => !prev);
  };

  const handleItemClick = (e: React.MouseEvent, item: KebabMenuItem) => {
    e.stopPropagation();
    close();
    item.onClick();
  };

  return (
    <div className="kebab-menu" ref={menuRef}>
      <button
        type="button"
        className="kebab-menu__trigger"
        onClick={handleToggle}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Aktionen"
      >
        <HiDotsVertical />
      </button>

      {open && (
        <ul className="kebab-menu__dropdown" role="menu">
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                className={`kebab-menu__item ${item.danger ? 'kebab-menu__item--danger' : ''}`}
                onClick={(e) => handleItemClick(e, item)}
              >
                {item.icon && <span className="kebab-menu__item-icon">{item.icon}</span>}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default KebabMenu;

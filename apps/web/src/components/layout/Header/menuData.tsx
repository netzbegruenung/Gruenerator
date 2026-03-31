import { getIcon, getIconById as getIconFromRegistry } from '../../../config/icons';

import type { BadgeType } from '../../common/StatusBadge';
import type { JSX, ComponentType } from 'react';
import type { IconType } from 'react-icons';

// Beta features interface
export interface BetaFeatures {
  databaseBetaEnabled?: boolean;
  youBetaEnabled?: boolean;
  isAustrian?: boolean;
}

// Menu item type definition
export interface MenuItemType {
  id: string;
  path?: string;
  title: string;
  description: string;
  icon?: IconType | ComponentType | null;
  hasSubmenu?: boolean;
  items?: MenuItemType[];
  badge?: BadgeType;
  activePaths?: string[];
}

// Menu section type definition
export interface MenuSection {
  title: string;
  icon?: IconType | ComponentType;
  items: MenuItemType[];
}

// Menu items result type
export interface MenuItemsResult {
  bildUndVideo: MenuSection;
  tools: MenuSection;
  labor?: MenuSection;
}

// Direct menu items result type
export type DirectMenuItemsResult = Record<string, MenuItemType>;

// Direkte Menüpunkte ohne Dropdown
export const getDirectMenuItems = (betaFeatures: BetaFeatures = {}): DirectMenuItemsResult => {
  const items: DirectMenuItemsResult = {};

  items.startseite = {
    id: 'startseite',
    path: '/',
    title: 'Startseite',
    description: 'Erstellen, Dokumente & Medien',
    icon: getIcon('navigation', 'home'),
  };

  items.docs = {
    id: 'docs',
    path: '/docs',
    title: 'Dokumente',
    description: 'Dokumente & Präsentationen',
    icon: getIcon('navigation', 'docs'),
    activePaths: ['/docs'],
  };

  return items;
};

// Mobile-only Menüpunkte (nur im NavMenu angezeigt)
export const getMobileOnlyMenuItems = (): DirectMenuItemsResult => {
  return {};
};

// Footer links for sidebar bottom
export const getFooterLinks = (): MenuItemType[] => [
  {
    id: 'apps',
    path: '/apps',
    title: 'Apps & Connect',
    description: 'Desktop-App & KI-Chat-Integration',
  },
  {
    id: 'support',
    path: '/support',
    title: 'Support',
    description: '',
  },
];

// Funktion zur Generierung der Hauptmenüstruktur - simplified, no more dropdowns
export const getMenuItems = (betaFeatures: BetaFeatures = {}): MenuItemsResult => {
  // All items moved to direct menu items - keeping this for backwards compatibility
  const result: MenuItemsResult = {
    bildUndVideo: { title: 'Bild und Video', items: [] },
    tools: { title: 'Tools', items: [] },
  };

  return result;
};

// Gemeinsame Komponente für Menüeinträge
export interface MenuItemProps {
  item: {
    id?: string;
    path: string;
    title: string;
    description: string;
    icon?: IconType | ComponentType | null;
  };
}

export const handleMenuInteraction = (
  event: React.KeyboardEvent | React.MouseEvent,
  type: 'keydown' | 'click',
  callback: () => void
) => {
  if (
    type === 'click' ||
    (event as React.KeyboardEvent).key === 'Enter' ||
    (event as React.KeyboardEvent).key === ' '
  ) {
    event.preventDefault();
    callback();
  }
};

export const getIconById = (id: string) => {
  return getIconFromRegistry(id);
};

export const menuStyles = {
  menuItem: 'menu-item-content',
  icon: 'menu-item-icon',
  header: 'menu-item-header',
  title: 'menu-item-title',
  description: 'menu-item-description',
  dropdownContent: {
    base: 'header-dropdown-content',
    show: 'show',
  },
};

export const MenuItem = ({ item }: MenuItemProps): JSX.Element => (
  <div className="menu-item-content">
    <div className="menu-item-icon">{item.icon && <item.icon aria-hidden="true" />}</div>
    <div className="menu-item-header">
      <h4 className="menu-item-title">{item.title}</h4>
      <p className="menu-item-description">{item.description}</p>
    </div>
  </div>
);

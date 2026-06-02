import { PiGlobe } from 'react-icons/pi';
import { RiSpyLine } from 'react-icons/ri';
import { SlNotebook } from 'react-icons/sl';

import { getIcon, getIconById as getIconFromRegistry } from '../../../config/icons';

import type { BadgeType } from '../../common/StatusBadge';
import type { JSX, ComponentType } from 'react';
import type { IconType } from 'react-icons';

export interface MenuFlags {
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
  /**
   * Query-param requirements for the item to be considered active. Useful when
   * multiple sidebar entries share the same path (e.g. /chat?agent=X vs.
   * /chat?agent=Y) — without this, both would highlight on any /chat URL.
   */
  activeQuery?: Record<string, string>;
}

// Menu section type definition
export interface MenuSection {
  title: string;
  icon?: IconType | ComponentType;
  items: MenuItemType[];
}

// Direct menu items result type
export type DirectMenuItemsResult = Record<string, MenuItemType>;

// Direkte Menüpunkte ohne Dropdown
export const getDirectMenuItems = (_flags: MenuFlags = {}): DirectMenuItemsResult => {
  const items: DirectMenuItemsResult = {};

  items.startseite = {
    id: 'startseite',
    path: '/',
    title: 'Workplace',
    description: 'Erstellen, Dokumente & Medien',
    icon: getIcon('navigation', 'home'),
  };

  items.docs = {
    id: 'docs',
    path: '/docs',
    title: 'Dokumente und Boards',
    description: 'Dokumente & Präsentationen',
    icon: getIcon('navigation', 'docs'),
    activePaths: ['/docs'],
  };

  items.notebooks = {
    id: 'notebooks',
    path: '/notebooks',
    title: 'Notebooks',
    description: 'Suche, Wissensmanagement & Dokumentenrecherche',
    icon: SlNotebook,
    activePaths: ['/notebooks', '/notebook'],
  };

  items.agents = {
    id: 'agents',
    path: '/skills',
    title: 'Skills & Agents',
    description: 'KI-Assistent*innen und Schnellbefehle für deine Aufgaben',
    icon: RiSpyLine,
    activePaths: ['/skills', '/agents'],
  };

  if (import.meta.env.DEV) {
    items.sites = {
      id: 'sites',
      path: '/sites',
      title: 'Sites',
      description: 'Kandidat*innen-Site-Builder',
      icon: PiGlobe,
      activePaths: ['/sites'],
    };
  }

  if (import.meta.env.DEV) {
    items.studio = {
      id: 'studio',
      path: '/studio',
      title: 'Studio',
      description: 'Sharepics erstellen und gemeinsam bearbeiten',
      icon: getIcon('navigation', 'sharepic'),
      activePaths: ['/studio'],
    };
  }

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

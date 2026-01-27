import { getIcon, getIconById as getIconFromRegistry } from '../../../config/icons';

import type { BadgeType } from '../../common/StatusBadge';
import type { JSX, ComponentType } from 'react';
import type { IconType } from 'react-icons';

// Beta features interface
export interface BetaFeatures {
  databaseBetaEnabled?: boolean;
  youBetaEnabled?: boolean;
  chatBetaEnabled?: boolean;
  scannerBetaEnabled?: boolean;
  igelModeEnabled?: boolean;
  websiteBetaEnabled?: boolean;
  isAustrian?: boolean;
}

// Menu item type definition
export interface MenuItemType {
  id: string;
  path: string;
  title: string;
  description: string;
  icon?: IconType | ComponentType | null;
  hasSubmenu?: boolean;
  items?: MenuItemType[];
  badge?: BadgeType;
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
  const items: DirectMenuItemsResult = {
    home: {
      id: 'home',
      path: '/',
      title: 'Start',
      description: 'Zurück zur Startseite',
      icon: getIcon('navigation', 'home'),
    },
    texte: {
      id: 'texte',
      path: '/texte',
      title: 'Texte',
      description: 'Anträge, Presse & Social Media, Universal',
      icon: getIcon('navigation', 'texte'),
    },
    reel: {
      id: 'reel',
      path: '/reel',
      title: 'Reel',
      description: 'Untertitel für Social Media Videos',
      icon: getIcon('navigation', 'reel'),
    },
    // TEMPORARILY HIDDEN - Image Studio menu item
    // imageStudio: {
    //   id: 'image-studio',
    //   path: '/image-studio',
    //   title: 'Bilder',
    //   description: 'Sharepics & KI-Bildgenerierung',
    //   icon: getIcon('navigation', 'sharepic'),
    //   badge: 'early-access'
    // },
    suche: {
      id: 'suche',
      path: '/suche',
      title: 'Suche',
      description: 'Webrecherche für aktuelle Informationen',
      icon: getIcon('navigation', 'suche'),
    },
    imagine: {
      id: 'imagine',
      path: '/imagine',
      title: 'Imagine',
      description: 'KI-Bildgenerierung',
      icon: getIcon('navigation', 'sharepic'),
    },
    notebooks: {
      id: 'notebooks',
      path: '/notebooks',
      title: 'Notebooks',
      description: 'Wissenssammlungen durchsuchen',
      icon: getIcon('ui', 'notebook'),
      badge: 'early-access',
    },
    // TEMPORARILY HIDDEN - Datenbank menu item
    // datenbank: {
    //   id: 'datenbank',
    //   path: '/datenbank',
    //   title: 'Datenbank',
    //   description: 'Vorlagen, Prompts und Anträge',
    //   icon: getIcon('navigation', 'datenbank'),
    // },
  };

  // Add chat if beta feature is enabled
  if (betaFeatures.chatBetaEnabled) {
    items.chat = {
      id: 'chat',
      path: '/chat',
      title: 'Chat',
      description: 'KI-Assistent für alle Textarten',
      icon: getIcon('ui', 'assistant'),
    };
  }

  // Add scanner if beta feature is enabled
  if (betaFeatures.scannerBetaEnabled) {
    items.scanner = {
      id: 'scanner',
      path: '/scanner',
      title: 'Scanner',
      description: 'Text aus Dokumenten extrahieren (OCR)',
      icon: getIcon('navigation', 'scanner'),
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

  // TEMPORARILY HIDDEN - Labor section with Datenbank
  // Only add labor section if beta features enabled
  // if (betaFeatures.databaseBetaEnabled) {
  //   result.labor = {
  //     title: 'Labor',
  //     items: [
  //       {
  //         id: 'datenbank',
  //         path: '/datenbank',
  //         title: 'Datenbank',
  //         description: 'Texte, Vorlagen und Anträge finden',
  //         icon: getIcon('navigation', 'datenbank'),
  //       },
  //     ],
  //   };
  // }

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

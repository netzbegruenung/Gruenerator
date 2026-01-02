import type { ComponentType } from 'react';
import { getIcon, getIconById as getIconFromRegistry } from '../../../config/icons';

// Direkte Menüpunkte ohne Dropdown - jetzt leer da alle in Dropdowns organisiert sind
export const getDirectMenuItems = (betaFeatures = {}) => {
  const items = {};
  // Alle direkten Links wurden in Dropdowns organisiert
  return items;
};

// Mobile-only Menüpunkte (nur im NavMenu angezeigt)
export const getMobileOnlyMenuItems = () => {
  return {};
};

// Funktion zur Generierung der Hauptmenüstruktur inkl. dynamischem "Labor"-Menü
export const getMenuItems = (betaFeatures = {}) => {
  // Dynamic tools items based on beta features
  const toolsItems = [
    {
      id: 'suche',
      path: '/suche',
      title: 'Suche',
      description: 'Webrecherche für aktuelle Informationen',
      icon: getIcon('navigation', 'suche')
    }
  ];

  // Add chat if beta feature is enabled
  if (betaFeatures.chatBetaEnabled) {
    toolsItems.push({
      id: 'chat',
      path: '/chat',
      title: 'Chat',
      description: 'KI-Assistent für alle Textarten',
      icon: getIcon('ui', 'assistant')
    });
  }

  toolsItems.push({
    id: 'barrierefreiheit',
    path: '/barrierefreiheit',
    title: 'Barrierefreiheit',
    description: 'Alt-Text & Leichte Sprache',
    icon: getIcon('navigation', 'barrierefreiheit')
  });

  toolsItems.push({
    id: 'texteditor',
    path: '/texteditor',
    title: 'Text Editor',
    description: 'Texte bearbeiten und verbessern',
    icon: getIcon('actions', 'edit')
  });

  toolsItems.push({
    id: 'apps',
    path: '/apps',
    title: 'Apps',
    description: 'Desktop-App herunterladen',
    icon: getIcon('actions', 'download')
  });

  // Add website generator if beta feature is enabled
  if (betaFeatures.websiteBetaEnabled) {
    toolsItems.push({
      id: 'website',
      path: '/website',
      title: 'Website',
      description: 'Landing Page JSON für WordPress',
      icon: getIcon('navigation', 'website')
    });
  }

  // Build texte items, conditionally including gruene-jugend based on igel mode
  const texteItems = [
    {
      id: 'antrag',
      path: '/antrag',
      title: 'Anträge & Anfragen',
      description: 'Anträge und Anfragen für Kommunalparlamente & Co.',
      icon: getIcon('navigation', 'antrag')
    },
    {
      id: 'presse-social',
      path: '/presse-social',
      title: 'Presse & Social Media',
      description: 'Pressemitteilungen und Social-Media-Posts',
      icon: getIcon('navigation', 'presse-social')
    },
    {
      id: 'universal',
      path: '/universal',
      title: 'Universal',
      description: 'Wahlprogramme, Reden oder freie Textformen',
      icon: getIcon('navigation', 'universal')
    }
  ];

  if (betaFeatures.igelModeEnabled) {
    texteItems.push({
      id: 'gruene-jugend',
      path: '/gruene-jugend',
      title: 'Grüne Jugend',
      description: 'Der Grünerator in jung',
      icon: getIcon('navigation', 'gruene-jugend')
    });
  }

  const staticMenuItems = {
    texte: {
      title: 'Texte',
      items: texteItems
    },
    bildUndVideo: {
      title: 'Bild und Video',
      items: [
        {
          id: 'reel',
          path: '/reel',
          title: 'Reel',
          description: 'Untertitel Reels für Social Media',
          icon: getIcon('navigation', 'reel')
        },
        ...(!betaFeatures.isAustrian ? [{
          id: 'image-studio',
          path: '/image-studio',
          title: 'Image Studio',
          description: 'Sharepics & KI-Bildgenerierung',
          icon: getIcon('navigation', 'sharepic')
        }] : []),
      ]
    },
    tools: {
      title: 'Tools',
      items: toolsItems
    }
    /* Temporär ausgeblendet - Grafik
    ,grafik: {
      title: 'Bild und Video',
      items: [
        {
          id: 'vorlagen',
          path: '/vorlagen',
          title: 'Canva-Vorlagen',
          description: 'Professionelle Design-Vorlagen für Canva',
          icon: PiPaintBrush // PiPaintBrush müsste ggf. importiert werden
        },
        // Sharepic wird jetzt unter Labor verwaltet, wenn aktiv
      ]
    }
    */
  };

  const laborItems = [];

  if (betaFeatures.databaseBetaEnabled) {
    laborItems.push({
      id: 'datenbank',
      path: '/datenbank',
      title: 'Datenbank',
      description: 'Texte, Vorlagen und Anträge finden',
      icon: getIcon('navigation', 'datenbank')
    });
  }

  // Build result with optional sections
  let result = staticMenuItems;

  if (laborItems.length > 0) {
    result = {
      ...result,
      labor: {
        title: 'Labor',
        items: laborItems
      }
    };
  }

  return result;
};

// Gemeinsame Komponente für Menüeinträge
export interface MenuItemProps {
  item: {
    id?: string;
    path: string;
    title: string;
    description: string;
    icon?: ComponentType
  };
}

export const handleMenuInteraction = (
  event: React.KeyboardEvent | React.MouseEvent,
  type: 'keydown' | 'click',
  callback: () => void
) => {
  if (type === 'click' || (event as React.KeyboardEvent).key === 'Enter' || (event as React.KeyboardEvent).key === ' ') {
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
  description: 'menu-item-description'
};

export const MenuItem = ({ item }: MenuItemProps): JSX.Element => (
  <div className="menu-item-content">
    <div className="menu-item-icon">
      {item.icon && <item.icon aria-hidden="true" />}
    </div>
    <div className="menu-item-header">
      <h4 className="menu-item-title">{item.title}</h4>
      <p className="menu-item-description">{item.description}</p>
    </div>
  </div>
);

import { getIcon, getIconById as getIconFromRegistry } from '../../../config/icons';
import PropTypes from 'prop-types';

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
export const MenuItem = ({ item }) => (
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

MenuItem.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    path: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    icon: PropTypes.elementType
  }).isRequired
};

// Gemeinsame Styles
export const menuStyles = {
  dropdownContent: {
    base: 'header-dropdown-content',
    show: 'show',
    mobile: 'mobile'
  },
  menuItem: {
    content: 'menu-item-content',
    header: 'menu-item-header',
    title: 'menu-item-title',
    description: 'menu-item-description'
  }
};

// Gemeinsame Funktionen
export const handleMenuInteraction = (event, type, callback) => {
  if (event.key === 'Enter' || event.key === ' ' || type === 'click') {
    event.preventDefault();
    callback();
  }
};

// Icon-Export-Funktion für konsistente Icon-Verwendung (backward compatibility)
export const getIconById = (id) => {
  return getIconFromRegistry(id);
};

// Alle Icons als Objekt exportieren (backward compatibility)
export const MENU_ICONS = {
  antrag: getIcon('navigation', 'antrag'),
  'presse-social': getIcon('navigation', 'presse-social'),
  universal: getIcon('navigation', 'universal'),
  'gruene-jugend': getIcon('navigation', 'gruene-jugend'),
  reel: getIcon('navigation', 'reel'),
  suche: getIcon('navigation', 'suche'),
  sharepic: getIcon('navigation', 'sharepic'),
  datenbank: getIcon('navigation', 'datenbank'),
  you: getIcon('navigation', 'you'),
  profile: getIcon('navigation', 'you'),
  tools: getIcon('navigation', 'tools')
}; 
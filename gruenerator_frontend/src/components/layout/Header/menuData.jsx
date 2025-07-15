import { PiFileText, PiNewspaper, PiMagicWand, PiMagnifyingGlass, PiVideoCamera, PiPencilSimple, PiImageSquare, PiArchive, PiFlask, PiUser, PiRobot, PiWrench } from 'react-icons/pi';
import { GiHedgehog } from 'react-icons/gi';
import PropTypes from 'prop-types';

// Direkte Menüpunkte ohne Dropdown - jetzt leer da alle in Dropdowns organisiert sind
export const getDirectMenuItems = (betaFeatures = {}) => {
  const items = {};
  // Alle direkten Links wurden in Dropdowns organisiert
  return items;
};

// Mobile-only Menüpunkte (nur im NavMenu angezeigt)
export const getMobileOnlyMenuItems = () => {
  return {
    profile: {
      id: 'profile',
      path: '/profile',
      title: 'Mein Konto',
      description: 'Profil und Einstellungen verwalten',
      icon: PiUser
    }
  };
};

// Funktion zur Generierung der Hauptmenüstruktur inkl. dynamischem "Labor"-Menü
export const getMenuItems = (betaFeatures = {}) => {
  const staticMenuItems = {
    texte: {
      title: 'Texte',
      items: [
        {
          id: 'antrag',
          path: '/antrag',
          title: 'Anträge & Anfragen',
          description: 'Anträge und Anfragen für Kommunalparlamente & Co.',
          icon: PiFileText
        },
        {
          id: 'presse-social',
          path: '/presse-social',
          title: 'Presse & Social Media',
          description: 'Pressemitteilungen und Social-Media-Posts',
          icon: PiNewspaper
        },
        {
          id: 'universal',
          path: '/universal',
          title: 'Universal',
          description: 'Wahlprogramme, Reden oder freie Textformen',
          icon: PiMagicWand
        },
        {
          id: 'gruene-jugend',
          path: '/gruene-jugend',
          title: 'Grüne Jugend',
          description: 'Der Grünerator in jung',
          icon: GiHedgehog
        }
      ]
    },
    tools: {
      title: 'Tools',
      items: [
        {
          id: 'suche',
          path: '/suche',
          title: 'Suche',
          description: 'Webrecherche für aktuelle Informationen',
          icon: PiMagnifyingGlass
        },
        {
          id: 'reel',
          path: '/reel',
          title: 'Reel',
          description: 'Untertitel Reels für Social Media',
          icon: PiVideoCamera
        },
        {
          id: 'sharepic',
          path: '/sharepic',
          title: 'Sharepics',
          description: 'Erstelle Sharepics für Social Media',
          icon: PiImageSquare
        }
      ]
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
      icon: PiArchive
    });
  }

  if (betaFeatures.youBetaEnabled) {
    laborItems.push({
      id: 'you',
      path: '/you',
      title: 'You Grünerator',
      description: 'Universeller KI-Assistent für alle Texte',
      icon: PiUser
    });
  }


  if (laborItems.length > 0) {
    return {
      ...staticMenuItems,
      labor: {
        title: 'Labor',
        items: laborItems
      }
    };
  }

  return staticMenuItems;
};

// Gemeinsame Komponente für Menüeinträge
export const MenuItem = ({ item }) => (
  <div className="menu-item-content">
    <div className="menu-item-icon">
      {item.icon && <item.icon aria-hidden="true" />}
    </div>
    <div className="menu-item-header">
      <span className="menu-item-title">{item.title}</span>
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

// Icon-Export-Funktion für konsistente Icon-Verwendung
export const getIconById = (id) => {
  const iconMap = {
    'antrag': PiFileText,
    'presse-social': PiNewspaper,
    'universal': PiMagicWand,
    'gruene-jugend': GiHedgehog,
    'reel': PiVideoCamera,
    'suche': PiMagnifyingGlass,
    'sharepic': PiImageSquare,
    'datenbank': PiArchive,
    'you': PiUser,
    'profile': PiUser,
    'tools': PiWrench
  };
  return iconMap[id];
};

// Alle Icons als Objekt exportieren
export const MENU_ICONS = {
  antrag: PiFileText,
  'presse-social': PiNewspaper,
  universal: PiMagicWand,
  'gruene-jugend': GiHedgehog,
  reel: PiVideoCamera,
  suche: PiMagnifyingGlass,
  sharepic: PiImageSquare,
  datenbank: PiArchive,
  you: PiUser,
  profile: PiUser,
  tools: PiWrench
}; 
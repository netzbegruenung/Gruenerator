import { PiFileText, PiNewspaper, PiMagicWand, PiImage, PiPaintBrush, PiVideoCamera } from 'react-icons/pi';
import { GiHedgehog } from 'react-icons/gi';
import PropTypes from 'prop-types';

export const menuItems = {
  texte: {
    title: 'Texte',
    items: [
      {
        id: 'antrag',
        path: '/antrag',
        title: 'Anträge',
        description: 'Anträge für Kommunalparlamente und co',
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
        description: 'Wahlprogramme, Reden oder freie Textformen.',
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
  grafik: {
    title: 'Bild und Video',
    items: [
      {
        id: 'vorlagen',
        path: '/vorlagen',
        title: 'Canva-Vorlagen',
        description: 'Professionelle Design-Vorlagen für Canva',
        icon: PiPaintBrush
      },
      {
        id: 'sharepic',
        path: '/sharepic',
        title: 'Sharepic Grünerator',
        description: 'Erstelle ansprechende Sharepics für Social Media',
        icon: PiImage
      },
      {
        id: 'reel',
        path: '/reel',
        title: 'Reel Grünerator',
        description: 'Automatitsche Untertitel und Captions',
        icon: PiVideoCamera
      }
    ]
  }
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
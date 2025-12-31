import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import { getIcon } from '../../../config/icons';
import { HiChat } from 'react-icons/hi';
import './desktop-home.css';

const featureCategories = [
  {
    title: 'Texte',
    items: [
      { title: 'Presse & Social Media', route: '/presse-social', icon: 'presse-social', iconCategory: 'navigation' },
      { title: 'Anträge & Anfragen', route: '/antrag', icon: 'antrag', iconCategory: 'navigation' },
      { title: 'Universal', route: '/universal', icon: 'universal', iconCategory: 'navigation' },
    ]
  },
  {
    title: 'Bild und Video',
    items: [
      { title: 'Reel', route: '/reel', icon: 'reel', iconCategory: 'navigation' },
      { title: 'Image Studio', route: '/image-studio', icon: 'sharepic', iconCategory: 'navigation' },
    ]
  },
  {
    title: 'Tools',
    items: [
      { title: 'Suche', route: '/suche', icon: 'suche', iconCategory: 'navigation' },
      { title: 'Chat', route: '/chat', icon: 'chat', iconCategory: 'custom' },
      { title: 'Barrierefreiheit', route: '/barrierefreiheit', icon: 'barrierefreiheit', iconCategory: 'navigation' },
      { title: 'Text Editor', route: '/texteditor', icon: 'edit', iconCategory: 'actions' },
    ]
  }
];

const FeatureCard = ({ title, route, icon, iconCategory, onClick }) => {
  const IconComponent = iconCategory === 'custom'
    ? HiChat
    : getIcon(iconCategory, icon);

  return (
    <button className="desktop-home-card" onClick={onClick}>
      <div className="desktop-home-card-icon">
        {IconComponent && <IconComponent />}
      </div>
      <span className="desktop-home-card-title">{title}</span>
    </button>
  );
};

const DesktopHome = () => {
  const firstName = useAuthStore(state => state.profile?.first_name);
  const navigate = useNavigate();

  return (
    <div className="desktop-home">
      <div className="desktop-home-content">
        <h1 className="desktop-home-welcome">
          Willkommen{firstName ? `, ${firstName}` : ''}!
        </h1>

        {featureCategories.map(category => (
          <div key={category.title} className="desktop-home-category">
            <h2 className="desktop-home-category-title">{category.title}</h2>
            <div className="desktop-home-grid">
              {category.items.map(feature => (
                <FeatureCard
                  key={feature.title}
                  {...feature}
                  onClick={() => navigate(feature.route)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DesktopHome;

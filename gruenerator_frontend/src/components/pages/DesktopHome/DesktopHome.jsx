import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../stores/authStore';
import { getIcon, ICONS } from '../../../config/icons';
import { HiChat } from 'react-icons/hi';
import './desktop-home.css';

const features = [
  { title: 'Pressemitteilung', route: '/presse-social', icon: 'presse-social', category: 'navigation' },
  { title: 'Instagram Post', route: '/presse-social', icon: 'instagram', category: 'platforms' },
  { title: 'Antrag', route: '/antrag', icon: 'antrag', category: 'navigation' },
  { title: 'Universal', route: '/universal', icon: 'universal', category: 'navigation' },
  { title: 'Chat', route: '/chat', icon: 'chat', category: 'custom' },
  { title: 'Reel', route: '/subtitler', icon: 'reel', category: 'navigation' },
  { title: 'Suche', route: '/suche', icon: 'suche', category: 'navigation' },
  { title: 'KI Bilder', route: '/image-studio', icon: 'imagine', category: 'navigation' },
  { title: 'Sharepic', route: '/sharepic', icon: 'sharepic', category: 'navigation' },
];

const FeatureCard = ({ title, route, icon, category, onClick }) => {
  const IconComponent = category === 'custom'
    ? HiChat
    : getIcon(category, icon);

  return (
    <button className="feature-card" onClick={onClick}>
      <div className="feature-card-icon">
        {IconComponent && <IconComponent />}
      </div>
      <span className="feature-card-title">{title}</span>
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

        <div className="feature-grid">
          {features.map(feature => (
            <FeatureCard
              key={feature.title}
              {...feature}
              onClick={() => navigate(feature.route)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DesktopHome;

import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import useBetaFeatures from '../../../hooks/useBetaFeatures';
import { useAuthStore } from '../../../stores/authStore';
import { getDirectMenuItems, type MenuItemType } from '../../layout/Header/menuData';

import type { ComponentType } from 'react';
import type { IconType } from 'react-icons';
import './desktop-home.css';

interface FeatureCardProps {
  item: MenuItemType;
  onClick: () => void;
}

const FeatureCard = ({ item, onClick }: FeatureCardProps) => {
  const IconComponent = item.icon as ComponentType | IconType | null;

  return (
    <button className="desktop-home-card" onClick={onClick}>
      <div className="desktop-home-card-icon">{IconComponent && <IconComponent />}</div>
      <span className="desktop-home-card-title">{item.title}</span>
    </button>
  );
};

const DesktopHome = () => {
  const displayName = useAuthStore((state) => state.user?.display_name);
  const firstName = displayName?.split(' ')[0];
  const navigate = useNavigate();
  const { getBetaFeatureState } = useBetaFeatures();
  const workplaceEnabled = getBetaFeatureState('workplace');

  const menuItems = useMemo(() => {
    const items = getDirectMenuItems({ workplace: workplaceEnabled });

    return Object.values(items).filter((item) => item.id !== 'home' && item.path);
  }, [workplaceEnabled]);

  return (
    <div className="desktop-home">
      <div className="desktop-home-content">
        <h1 className="desktop-home-welcome">Willkommen{firstName ? `, ${firstName}` : ''}!</h1>

        <div className="desktop-home-grid">
          {menuItems.map((item) => (
            <FeatureCard key={item.id} item={item} onClick={() => navigate(item.path!)} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DesktopHome;

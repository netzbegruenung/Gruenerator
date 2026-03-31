import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import { getDirectMenuItems, type MenuItemType } from '../../layout/Header/menuData';

import type { ComponentType } from 'react';
import type { IconType } from 'react-icons';

interface FeatureCardProps {
  item: MenuItemType;
  onClick: () => void;
}

const FeatureCard = ({ item, onClick }: FeatureCardProps) => {
  const IconComponent = item.icon as ComponentType | IconType | null;

  return (
    <button
      className="flex flex-col items-center justify-center gap-sm p-lg bg-background border border-grey-200 dark:border-grey-700 rounded-xl cursor-pointer transition-all duration-200 min-h-[120px] hover:scale-[1.02] hover:border-primary-300 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)] dark:hover:border-primary-500 dark:hover:shadow-[0_4px_12px_rgba(0,0,0,0.3)] active:scale-[0.98]"
      onClick={onClick}
    >
      <div className="flex items-center justify-center w-12 h-12 text-primary-600 dark:text-primary-400 [&_svg]:w-8 [&_svg]:h-8">
        {IconComponent && <IconComponent />}
      </div>
      <span className="text-[0.9rem] font-medium text-foreground text-center">{item.title}</span>
    </button>
  );
};

const DesktopHome = () => {
  const displayName = useAuthStore((state) => state.user?.display_name);
  const firstName = displayName?.split(' ')[0];
  const navigate = useNavigate();
  const menuItems = useMemo(() => {
    const items = getDirectMenuItems();

    return Object.values(items).filter((item) => item.id !== 'home' && item.path);
  }, []);

  return (
    <div className="min-h-full flex items-center justify-center p-xl bg-background">
      <div className="max-w-[700px] w-full">
        <h1 className="font-['Raleway','PT_Sans',Arial,sans-serif] text-3xl font-bold text-foreground-heading text-center mb-xl tracking-[-0.02em]">
          Willkommen{firstName ? `, ${firstName}` : ''}!
        </h1>

        <div className="grid grid-cols-3 gap-lg">
          {menuItems.map((item) => (
            <FeatureCard key={item.id} item={item} onClick={() => navigate(item.path!)} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default DesktopHome;

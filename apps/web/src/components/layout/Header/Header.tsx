import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import ProfileButton from './ProfileButton';
import useHeaderStore from '../../../stores/headerStore';
import useSidebarStore from '../../../stores/sidebarStore';
import '../../../assets/styles/components/layout/header.css';

const Header = () => {
  const location = useLocation();
  const forceShrunk = useHeaderStore((state) => state.forceShrunk);
  const closeSidebar = useSidebarStore((state) => state.close);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    closeSidebar();
  }, [location.pathname]);

  return (
    <header
      className={`header header--transparent ${forceShrunk ? 'scrolled' : ''}`}
      ref={headerRef}
      role="banner"
    >
      <div className="header-container">
        <div className="header-actions">
          <ProfileButton />
        </div>
      </div>
    </header>
  );
};

export default Header;

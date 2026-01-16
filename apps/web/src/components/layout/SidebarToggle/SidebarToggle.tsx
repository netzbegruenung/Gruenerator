import { memo } from 'react';
import useSidebarStore from '../../../stores/sidebarStore';
import './SidebarToggle.css';

const SidebarToggle = memo(() => {
  const isOpen = useSidebarStore((state) => state.isOpen);
  const toggle = useSidebarStore((state) => state.toggle);

  return (
    <button
      className={`sidebar-toggle ${isOpen ? 'active' : ''}`}
      onClick={toggle}
      aria-label={isOpen ? "Menü schließen" : "Menü öffnen"}
      aria-expanded={isOpen}
    >
      <div className="sidebar-toggle__hamburger" aria-hidden="true">
        <span className="sidebar-toggle__line" />
        <span className="sidebar-toggle__line" />
        <span className="sidebar-toggle__line" />
      </div>
    </button>
  );
});

SidebarToggle.displayName = 'SidebarToggle';

export default SidebarToggle;

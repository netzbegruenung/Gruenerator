import { FiSidebar } from 'react-icons/fi';

import './EditorFAB.css';

interface EditorFABProps {
  connectionStatus: 'connected' | 'syncing' | 'disconnected';
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export const EditorFAB = ({ connectionStatus, sidebarOpen, onToggleSidebar }: EditorFABProps) => (
  <button
    className={`editor-fab ${sidebarOpen ? 'active' : ''}`}
    onClick={onToggleSidebar}
    aria-label="Seitenleiste ein-/ausblenden"
  >
    <FiSidebar />
    <span className={`editor-fab__status ${connectionStatus}`} />
  </button>
);

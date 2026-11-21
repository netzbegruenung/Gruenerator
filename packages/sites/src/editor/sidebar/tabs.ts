import { type IconType } from 'react-icons';
import { FiFileText, FiLayers, FiPlusSquare, FiDroplet, FiSettings } from 'react-icons/fi';

/** The rail's tabs, in rail order. */
export const SIDEBAR_TABS = [
  { id: 'bausteine', label: 'Bausteine', ariaLabel: 'Bausteine hinzufügen', icon: FiPlusSquare },
  { id: 'seite', label: 'Seite', ariaLabel: 'Seite ordnen', icon: FiLayers },
  { id: 'design', label: 'Design', ariaLabel: 'Design', icon: FiDroplet },
  { id: 'einstellungen', label: 'Einstellungen', ariaLabel: 'Einstellungen', icon: FiSettings },
  { id: 'impressum', label: 'Impressum', ariaLabel: 'Impressum', icon: FiFileText },
] as const satisfies readonly { id: string; label: string; ariaLabel: string; icon: IconType }[];

export type SidebarTabId = (typeof SIDEBAR_TABS)[number]['id'];

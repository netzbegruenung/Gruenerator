import { PiCloud, PiGlobe, PiEnvelope } from 'react-icons/pi';
import { IconType } from 'react-icons';

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  icon: IconType;
  tooltip: string;
}

export const QUICK_LINKS: QuickLink[] = [
  {
    id: 'wolke',
    label: 'Wolke',
    url: 'https://wolke.netzbegruenung.de',
    icon: PiCloud,
    tooltip: 'Wolke öffnen',
  },
];

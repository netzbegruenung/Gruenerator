import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

import { type AppRoute } from '../../types/routes';

export interface ToolDef {
  id: string;
  title: string;
  icon: IoniconsIconName;
  route: AppRoute;
}

/**
 * Single source of truth for the app's tools. Both the Tools tab (full set) and
 * the Start screen's "Werkzeuge" section (favorites only) render from this list,
 * so a tool is defined once and favorited by `id` via `useToolFavoritesStore`.
 */
export const TOOLS: ToolDef[] = [
  { id: 'reel', title: 'Reel', icon: 'videocam', route: '/(tabs)/(tools)/reel' },
  {
    id: 'ki-bildgenerierung',
    title: 'KI-Bild',
    icon: 'sparkles',
    route: '/(tabs)/(tools)/ki-bildgenerierung',
  },
  { id: 'scanner', title: 'Scanner', icon: 'scan', route: '/(tabs)/(tools)/scanner' },
  {
    id: 'transkription',
    title: 'Transkription',
    icon: 'mic',
    route: '/(tabs)/(tools)/transkription',
  },
  { id: 'websuche', title: 'Websuche', icon: 'globe', route: '/(tabs)/(recherche)/suche' },
];

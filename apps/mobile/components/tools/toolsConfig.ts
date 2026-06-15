import { type IoniconsIconName } from '@react-native-vector-icons/ionicons';

import { type AppRoute } from '../../types/routes';

export interface ToolDef {
  id: string;
  title: string;
  description: string;
  icon: IoniconsIconName;
  route: AppRoute;
}

/**
 * Single source of truth for the app's tools. Both the Tools tab (full set) and
 * the Start screen's "Werkzeuge" section (favorites only) render from this list,
 * so a tool is defined once and favorited by `id` via `useToolFavoritesStore`.
 */
export const TOOLS: ToolDef[] = [
  {
    id: 'reel',
    title: 'Reel',
    description: 'Videos mit automatischen Untertiteln versehen',
    icon: 'videocam',
    route: '/(tabs)/(tools)/reel',
  },
  {
    id: 'ki-bildgenerierung',
    title: 'KI-Bild',
    description: 'Bilder mit KI erstellen, verwandeln oder bearbeiten',
    icon: 'sparkles',
    route: '/(tabs)/(tools)/ki-bildgenerierung',
  },
  {
    id: 'scanner',
    title: 'Scanner',
    description: 'Text aus Dokumenten und Fotos extrahieren',
    icon: 'scan',
    route: '/(tabs)/(tools)/scanner',
  },
];
